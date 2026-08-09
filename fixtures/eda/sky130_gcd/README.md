# SKY130 GCD production-path reference

This bundle is a small, synthesizable reference used to verify the isolated,
digest-pinned worker path. `flow.ys` produces a real Yosys netlist. The
`config.mk` plus `flow.tcl` marker selects the complete OpenROAD Flow Scripts
RTL-to-GDS path for SKY130HD and retains reports, logs, netlists, DEF/ODB and
final GDS artifacts.

This is an open-source integration proof. It is not a foundry-qualified or
commercial-tool tapeout signoff claim.
