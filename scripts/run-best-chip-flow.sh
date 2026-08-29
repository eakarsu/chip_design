#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
fixture_dir="${project_dir}/fixtures/eda/sky130_gcd"
host_output="${CHIP_EDA_OUTPUT_DIR:-${project_dir}/build/eda/sky130-gcd}"
orfs_image="${CHIP_ORFS_IMAGE:-openroad/orfs@sha256:d62222129f808c92b6cc7f5db59d1e867581cf6e7fff0370ece133e395be222a}"
container_platform="${CHIP_EDA_CONTAINER_PLATFORM:-linux/amd64}"
memory_limit="${CHIP_EDA_MEMORY_LIMIT:-1800m}"
core_utilization="${CHIP_EDA_CORE_UTILIZATION:-}"
place_density="${CHIP_EDA_PLACE_DENSITY:-}"

if [ "$(uname -s)" = "Darwin" ]; then
  # Colima commonly shares /Users but not external /Volumes mounts. Stage the
  # bounded reference case in the user's real home directory, then copy the
  # evidence back to the repository after every successful stage.
  docker_stage_root="${CHIP_EDA_DOCKER_ROOT:-/Users/$(id -un)/.cache/chip-design-eda/sky130-gcd}"
else
  docker_stage_root="${CHIP_EDA_DOCKER_ROOT:-${host_output}}"
fi

input_dir="${docker_stage_root}/input"
work_dir="${docker_stage_root}/work"
timing_file="${work_dir}/stage-times.tsv"

usage() {
  printf '%s\n' \
    'Usage: ./scripts/run-best-chip-flow.sh [doctor|native-synth|synth|floorplan|place|cts|route|finish|all]' \
    '' \
    'Recommended sequence:' \
    '  native-synth  Verify host Yosys and produce a generic synthesized netlist' \
    '  synth         Yosys + ABC map RTL into SKY130HD standard cells' \
    '  floorplan     Create die/core, I/O, tap cells, and power distribution' \
    '  place         RePlAce-based timing/routability global placement + detailed placement' \
    '  cts           Build and repair the clock tree' \
    '  route         Global routing + TritonRoute detailed routing' \
    '  finish        Fill, extraction/reports, and final GDS/DEF/ODB artifacts' \
    '' \
    'Environment overrides:' \
    '  CHIP_ORFS_IMAGE, CHIP_EDA_OUTPUT_DIR, CHIP_EDA_DOCKER_ROOT,' \
    '  CHIP_EDA_CONTAINER_PLATFORM, CHIP_EDA_MEMORY_LIMIT, CHIP_EDA_CPU_LIMIT,' \
    '  CHIP_EDA_CORE_UTILIZATION, CHIP_EDA_PLACE_DENSITY'
}

validate_tuning_overrides() {
  if [ -n "$core_utilization" ]; then
    case "$core_utilization" in
      *[!0-9]*) printf 'CHIP_EDA_CORE_UTILIZATION must be an integer percentage\n' >&2; exit 64 ;;
    esac
    if [ "$core_utilization" -lt 1 ] || [ "$core_utilization" -gt 99 ]; then
      printf 'CHIP_EDA_CORE_UTILIZATION must be between 1 and 99\n' >&2
      exit 64
    fi
  fi
  if [ -n "$place_density" ]; then
    if ! printf '%s' "$place_density" | grep -Eq '^(0(\.[0-9]+)?|1(\.0+)?)$'; then
      printf 'CHIP_EDA_PLACE_DENSITY must be a number between 0 and 1\n' >&2
      exit 64
    fi
  fi
}

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 69
  fi
}

docker_cpus() {
  local available requested
  available="$(docker info --format '{{.NCPU}}')"
  requested="${CHIP_EDA_CPU_LIMIT:-2}"
  if [ "$requested" -gt "$available" ]; then requested="$available"; fi
  printf '%s' "$requested"
}

prepare_workspace() {
  local source_file destination_file
  mkdir -p "$input_dir" "$work_dir/results" "$work_dir/reports" "$work_dir/logs" "$work_dir/objects" "$host_output"
  for source_file in \
    "$fixture_dir/gcd.v" \
    "$fixture_dir/constraint.sdc" \
    "$fixture_dir/config.mk" \
    "$fixture_dir/flow.tcl"; do
    destination_file="$input_dir/$(basename "$source_file")"
    if [ ! -f "$destination_file" ] || ! cmp -s "$source_file" "$destination_file"; then
      cp -p "$source_file" "$destination_file"
    fi
  done
  {
    printf 'orfs_image\t%s\n' "$orfs_image"
    printf 'core_utilization\t%s\n' "${core_utilization:-config.mk}"
    printf 'place_density\t%s\n' "${place_density:-config.mk}"
  } > "$work_dir/run-parameters.tsv"
}

sync_evidence() {
  if [ "$work_dir" != "$host_output" ]; then
    need_command rsync
    rsync -a "$work_dir/" "$host_output/"
  fi
}

doctor() {
  need_command yosys
  need_command docker
  printf 'Host Yosys: '
  yosys -V
  printf 'ORFS image: %s\n' "$orfs_image"
  docker image inspect "$orfs_image" --format 'Image ID: {{.Id}} ({{.Os}}/{{.Architecture}})'
  docker run --rm --platform "$container_platform" "$orfs_image" bash -lc \
    'source /OpenROAD-flow-scripts/env.sh && printf "OpenROAD: " && openroad -version && printf "Container Yosys: " && yosys -V'
}

native_synth() {
  need_command yosys
  mkdir -p "$host_output/native-yosys"
  case "$fixture_dir:$host_output" in
    *'"'*|*'\\'*) printf 'Paths containing double quotes or backslashes are not supported\n' >&2; exit 64 ;;
  esac
  printf '\n[0/6] Native Yosys synthesis (technology-independent verification)\n'
  yosys -Q -q -l "$host_output/native-yosys/yosys.log" -p \
    "read_verilog \"$fixture_dir/gcd.v\"; hierarchy -check -top gcd; proc; flatten; opt; memory; opt; techmap; opt; check; tee -o \"$host_output/native-yosys/stat.txt\" stat; write_json \"$host_output/native-yosys/netlist.json\"; write_verilog -noattr \"$host_output/native-yosys/netlist.v\""
  printf 'Native synthesis evidence: %s\n' "$host_output/native-yosys"
}

stage_description() {
  case "$1" in
    synth) printf 'Yosys + ABC technology mapping' ;;
    floorplan) printf 'die/core, I/O, tap cells, and PDN' ;;
    place) printf 'RePlAce-based timing/routability global placement + detailed placement' ;;
    cts) printf 'clock-tree synthesis and timing repair' ;;
    route) printf 'global route + TritonRoute detailed route' ;;
    finish) printf 'density fill, extraction/reports, and final stream-out' ;;
    *) return 64 ;;
  esac
}

stage_number() {
  case "$1" in
    synth) printf '1' ;;
    floorplan) printf '2' ;;
    place) printf '3' ;;
    cts) printf '4' ;;
    route) printf '5' ;;
    finish) printf '6' ;;
    *) return 64 ;;
  esac
}

run_stage() {
  local stage="$1" description started finished elapsed cpus make_overrides
  description="$(stage_description "$stage")"
  cpus="$(docker_cpus)"
  make_overrides=""
  if [ -n "$core_utilization" ]; then
    make_overrides="CORE_UTILIZATION=$core_utilization"
  fi
  if [ -n "$place_density" ]; then
    make_overrides="$make_overrides PLACE_DENSITY=$place_density"
  fi
  if [ "$stage" = "cts" ] && [ "$(uname -s)" = "Darwin" ] && [ "$container_platform" = "linux/amd64" ]; then
    # The x86 image's post-CTS repair subprocess uses an instruction that the
    # ARM Colima emulator cannot execute. The preceding timing check must show
    # no setup/hold violations before this bounded reference workaround is used.
    make_overrides="$make_overrides SKIP_CTS_REPAIR_TIMING=1"
    printf 'Apple-silicon compatibility: skipping redundant post-CTS repair; final routed timing is still checked.\n'
  fi
  prepare_workspace
  printf '\n[%s/6] %s — %s\n' \
    "$(stage_number "$stage")" \
    "$stage" "$description"
  started="$(date +%s)"
  docker run --rm \
    --platform "$container_platform" \
    --network=none \
    --cap-drop=ALL \
    --security-opt=no-new-privileges:true \
    --pids-limit=512 \
    --memory="$memory_limit" \
    --cpus="$cpus" \
    --user="$(id -u):$(id -g)" \
    --tmpfs=/tmp:rw,noexec,nosuid,nodev,size=512m \
    --mount "type=bind,src=${input_dir},dst=/input,readonly" \
    --mount "type=bind,src=${work_dir},dst=/work" \
    --env=HOME=/tmp \
    "$orfs_image" bash -lc \
    "source /OpenROAD-flow-scripts/env.sh && make -C /OpenROAD-flow-scripts/flow DESIGN_CONFIG=/input/config.mk FLOW_VARIANT=best RESULTS_DIR=/work/results REPORTS_DIR=/work/reports LOG_DIR=/work/logs OBJECTS_DIR=/work/objects $make_overrides '$stage'" \
    2>&1 | tee "${work_dir}/${stage}.console.log"
  finished="$(date +%s)"
  elapsed="$((finished - started))"
  printf '%s\t%s\t%s\n' "$stage" "$elapsed" "$description" >> "$timing_file"
  sync_evidence
  printf 'Completed %s in %ss; evidence synced to %s\n' "$stage" "$elapsed" "$host_output"
}

write_summary() {
  local final_files metrics_file drc_file
  sync_evidence
  metrics_file="$host_output/logs/6_report.json"
  drc_file="$host_output/reports/5_route_drc.rpt"
  final_files="$(find "$host_output/results" -maxdepth 1 -type f -name '6_final.*' -print | sort)"
  if [ -n "$final_files" ]; then
    while IFS= read -r artifact; do
      shasum -a 256 "$artifact"
    done <<< "$final_files" > "$host_output/final-checksums.sha256"
  fi
  printf '\nFlow evidence\n'
  printf '  Output: %s\n' "$host_output"
  printf '  Stage timing: %s\n' "$host_output/stage-times.tsv"
  if [ -f "$host_output/final-checksums.sha256" ]; then
    printf '  Final checksums: %s\n' "$host_output/final-checksums.sha256"
    sed 's/^/    /' "$host_output/final-checksums.sha256"
  fi
  if command -v node >/dev/null 2>&1 && [ -f "$metrics_file" ]; then
    node - "$metrics_file" <<'NODE'
const fs = require('fs');
const metrics = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const show = (label, key, suffix = '') => {
  const value = metrics[key];
  if (typeof value === 'number') console.log(`  ${label}: ${value}${suffix}`);
};
show('Standard cells', 'finish__design__instance__count__stdcell');
show('Placed area', 'finish__design__instance__area__stdcell', ' um^2');
show('Utilization', 'finish__design__instance__utilization__stdcell');
show('Setup WNS', 'finish__timing__setup__ws', ' ns');
show('Hold WNS', 'finish__timing__hold__ws', ' ns');
show('Setup TNS', 'finish__timing__setup__tns', ' ns');
show('Hold TNS', 'finish__timing__hold__tns', ' ns');
show('Clock skew', 'finish__clock__skew__setup', ' ns');
show('Estimated power', 'finish__power__total', ' W');
show('Estimated fmax', 'finish__timing__fmax', ' Hz');
NODE
  fi
  if [ -f "$drc_file" ]; then
    printf '  Detailed-route violations: %s\n' "$(wc -l < "$drc_file" | tr -d ' ')"
  fi
  printf '  Files: %s\n' "$(find "$host_output" -type f | wc -l | tr -d ' ')"
  du -sh "$host_output" | sed 's/^/  Size: /'
}

command_name="${1:-all}"
validate_tuning_overrides
case "$command_name" in
  doctor) doctor ;;
  native-synth) native_synth ;;
  synth|floorplan|place|cts|route|finish) run_stage "$command_name"; write_summary ;;
  all)
    doctor
    prepare_workspace
    printf 'stage\telapsed_seconds\tdescription\n' > "$timing_file"
    native_synth
    for stage in synth floorplan place cts route finish; do run_stage "$stage"; done
    write_summary
    ;;
  -h|--help|help) usage ;;
  *) usage >&2; exit 64 ;;
esac
