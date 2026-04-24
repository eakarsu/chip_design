"""Python mirror of the TypeScript design-state bridge.

Keeps the wire format, content-hash, and diff routines byte-compatible
with `src/lib/bridge/design_state.ts`. If you change this file, update the
TS counterpart so both sides keep producing identical SHA-256 hashes.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional


DESIGN_SCHEMA_VERSION = 1


@dataclass
class Point:
    x: float
    y: float


@dataclass
class Pin:
    id: str
    name: str
    position: Dict[str, float]
    direction: str  # 'input' | 'output' | 'inout'


@dataclass
class Cell:
    id: str
    name: str
    width: float
    height: float
    pins: List[Pin]
    type: str  # 'standard' | 'macro' | 'io'
    position: Optional[Dict[str, float]] = None


@dataclass
class Net:
    id: str
    name: str
    pins: List[str]
    weight: float = 1.0


@dataclass
class Wire:
    id: str
    netId: str
    points: List[Dict[str, float]]
    layer: int
    width: float


@dataclass
class DesignSnapshot:
    """Canonical snapshot. Must round-trip losslessly to/from the TS side."""
    id: str
    name: str
    createdAt: str
    updatedAt: str
    cells: List[Dict[str, Any]]
    nets: List[Dict[str, Any]]
    wires: List[Dict[str, Any]]
    schemaVersion: int = DESIGN_SCHEMA_VERSION
    ownerId: Optional[str] = None
    dieArea: Optional[Dict[str, float]] = None
    verilog: Optional[str] = None
    sdc: Optional[str] = None
    lef: Optional[str] = None
    def_: Optional[str] = None   # 'def' is a Python keyword
    analyses: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


def from_snapshot_json(raw) -> DesignSnapshot:
    """Deserialize a JSON string or dict. Raises ValueError on bad input."""
    obj = json.loads(raw) if isinstance(raw, str) else raw
    if not isinstance(obj, dict):
        raise ValueError("design snapshot: expected a JSON object")
    v = obj.get("schemaVersion")
    if not isinstance(v, int):
        raise ValueError("design snapshot: missing schemaVersion")
    if v > DESIGN_SCHEMA_VERSION:
        raise ValueError(
            f"design snapshot: schemaVersion {v} is newer than this build "
            f"({DESIGN_SCHEMA_VERSION})"
        )
    required = ("id", "name", "createdAt", "updatedAt", "cells", "nets", "wires")
    for k in required:
        if k not in obj:
            raise ValueError(f'design snapshot: missing field "{k}"')
    for k in ("cells", "nets", "wires"):
        if not isinstance(obj[k], list):
            raise ValueError(f"design snapshot: {k} must be an array")
    return DesignSnapshot(
        schemaVersion=DESIGN_SCHEMA_VERSION,
        id=obj["id"], name=obj["name"],
        ownerId=obj.get("ownerId"),
        createdAt=obj["createdAt"], updatedAt=obj["updatedAt"],
        dieArea=obj.get("dieArea"),
        cells=obj["cells"], nets=obj["nets"], wires=obj["wires"],
        verilog=obj.get("verilog"), sdc=obj.get("sdc"),
        lef=obj.get("lef"), def_=obj.get("def"),
        analyses=obj.get("analyses"),
        metadata=obj.get("metadata"),
    )


def to_json(snap: DesignSnapshot, *, pretty: bool = False) -> str:
    d = _snapshot_dict(snap)
    if pretty:
        return json.dumps(d, indent=2)
    return json.dumps(d, separators=(",", ":"))


def _snapshot_dict(snap: DesignSnapshot) -> Dict[str, Any]:
    d: Dict[str, Any] = {
        "schemaVersion": snap.schemaVersion,
        "id": snap.id, "name": snap.name,
        "createdAt": snap.createdAt, "updatedAt": snap.updatedAt,
        "cells": snap.cells, "nets": snap.nets, "wires": snap.wires,
    }
    for k, v in [
        ("ownerId", snap.ownerId), ("dieArea", snap.dieArea),
        ("verilog", snap.verilog), ("sdc", snap.sdc),
        ("lef", snap.lef), ("def", snap.def_),
        ("analyses", snap.analyses), ("metadata", snap.metadata),
    ]:
        if v is not None:
            d[k] = v
    return d


def hash_snapshot(snap: DesignSnapshot) -> str:
    """SHA-256 over the canonical content fields. Must match the TS hash."""
    hashable = {
        "schemaVersion": snap.schemaVersion,
        "id": snap.id, "name": snap.name,
        "dieArea": snap.dieArea if snap.dieArea is not None else None,
        "cells": snap.cells, "nets": snap.nets, "wires": snap.wires,
        "verilog": snap.verilog, "sdc": snap.sdc,
        "lef": snap.lef, "def": snap.def_,
    }
    # sort_keys=True + compact separators matches stableStringify() in TS.
    canon = json.dumps(hashable, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


def diff_snapshots(a: DesignSnapshot, b: DesignSnapshot) -> Dict[str, List]:
    """Structural diff, same shape as the TS `diffSnapshots` return."""
    a_cells = {c["id"]: c for c in a.cells}
    b_cells = {c["id"]: c for c in b.cells}
    a_nets = {n["id"]: n for n in a.nets}
    b_nets = {n["id"]: n for n in b.nets}

    cells_added = [cid for cid in b_cells if cid not in a_cells]
    cells_removed = [cid for cid in a_cells if cid not in b_cells]
    cells_moved = []
    for cid, c in a_cells.items():
        if cid not in b_cells:
            continue
        f = c.get("position")
        t = b_cells[cid].get("position")
        if f and t and (f.get("x") != t.get("x") or f.get("y") != t.get("y")):
            cells_moved.append({"id": cid, "from": f, "to": t})

    nets_added = [nid for nid in b_nets if nid not in a_nets]
    nets_removed = [nid for nid in a_nets if nid not in b_nets]
    nets_changed = []
    for nid, n in a_nets.items():
        if nid not in b_nets:
            continue
        bn = b_nets[nid]
        if n.get("pins") != bn.get("pins"):
            nets_changed.append(nid)

    return {
        "cellsAdded": cells_added,
        "cellsRemoved": cells_removed,
        "cellsMoved": cells_moved,
        "netsAdded": nets_added,
        "netsRemoved": nets_removed,
        "netsChanged": nets_changed,
    }


__all__ = [
    "DESIGN_SCHEMA_VERSION",
    "DesignSnapshot",
    "from_snapshot_json",
    "to_json",
    "hash_snapshot",
    "diff_snapshots",
]
