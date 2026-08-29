export DESIGN_NAME = gcd
export PLATFORM = sky130hd
export VERILOG_FILES = /input/gcd.v
export SDC_FILE = /input/constraint.sdc
# Selected by the bounded 2026-08-28 PPA sweep. 65% reached a persistent
# seven-violation detailed-routing boundary; 60% closed with zero violations.
export CORE_UTILIZATION = 60
export TNS_END_PERCENT = 100
export PLACE_DENSITY = 0.78
