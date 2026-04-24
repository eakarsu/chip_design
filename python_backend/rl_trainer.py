"""Online RL retraining — Python trainer side.

The TS collector writes transitions to the `algorithm_runs` SQLite table.
This trainer reads them back in batches and runs a simple REINFORCE-style
policy-gradient update on whichever model is plugged in. The idea is that
over time, the policy that picks an `algorithm` for a given `state` learns
to prefer actions that yield higher reward.

This module is a *pipeline* — the specific model architecture stays in
`python_backend/models/*`. We keep the trainer minimal and stateless so
it can be restarted without losing progress (the DB is the ground truth).
"""
from __future__ import annotations

import json
import math
import sqlite3
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional


@dataclass
class Transition:
    """Matches the shape written by the TS ReplayBuffer."""
    id: str
    design_id: Optional[str]
    user_id: Optional[str]
    category: str
    algorithm: str
    parameters: Dict[str, Any]
    state_hash: str
    state_features: Dict[str, float]
    reward: float
    priority: float
    created_at: str


def load_transitions(
    db_path: str,
    *,
    category: Optional[str] = None,
    limit: int = 1024,
) -> List[Transition]:
    """Read the most recent `limit` transitions from the DB."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        sql = (
            "SELECT id, design_id, user_id, category, algorithm, "
            "       parameters_json, result_json, created_at "
            "FROM algorithm_runs "
        )
        params: List[Any] = []
        if category:
            sql += "WHERE category = ? "
            params.append(category)
        sql += "ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()

    out: List[Transition] = []
    for r in rows:
        result = json.loads(r["result_json"] or "{}")
        out.append(Transition(
            id=r["id"], design_id=r["design_id"], user_id=r["user_id"],
            category=r["category"], algorithm=r["algorithm"],
            parameters=json.loads(r["parameters_json"] or "{}"),
            state_hash=result.get("stateHash", ""),
            state_features=result.get("stateFeatures", {}) or {},
            reward=float(result.get("reward", 0.0)),
            priority=float(result.get("priority", 1.0)),
            created_at=r["created_at"],
        ))
    return out


def reward_baseline(transitions: Iterable[Transition]) -> float:
    """Mean reward; used as a REINFORCE baseline to reduce variance."""
    rs = [t.reward for t in transitions]
    return sum(rs) / len(rs) if rs else 0.0


def action_advantages(
    transitions: List[Transition],
    baseline: Optional[float] = None,
) -> List[float]:
    """Compute (reward − baseline) per transition."""
    b = baseline if baseline is not None else reward_baseline(transitions)
    return [t.reward - b for t in transitions]


def policy_statistics(transitions: List[Transition]) -> Dict[str, Any]:
    """Summary stats the UI can render without loading a model.

    Returns per-action reward mean / count, and the top / worst action.
    """
    per_action: Dict[str, List[float]] = {}
    for t in transitions:
        per_action.setdefault(t.algorithm, []).append(t.reward)
    stats: Dict[str, Dict[str, float]] = {}
    for a, rs in per_action.items():
        stats[a] = {
            "count": len(rs),
            "mean_reward": sum(rs) / len(rs),
            "max_reward": max(rs),
            "min_reward": min(rs),
        }
    best = max(stats.items(), key=lambda kv: kv[1]["mean_reward"], default=None)
    worst = min(stats.items(), key=lambda kv: kv[1]["mean_reward"], default=None)
    return {
        "per_action": stats,
        "best_action": best[0] if best else None,
        "worst_action": worst[0] if worst else None,
        "total_samples": len(transitions),
    }


def softmax(xs: List[float]) -> List[float]:
    if not xs:
        return []
    m = max(xs)
    es = [math.exp(x - m) for x in xs]
    s = sum(es) or 1.0
    return [e / s for e in es]


def update_preferences(
    preferences: Dict[str, float],
    transitions: List[Transition],
    *,
    lr: float = 0.1,
) -> Dict[str, float]:
    """Tiny REINFORCE-style update on a softmax-over-actions preference vector.

    The policy is π(a) = softmax(preferences)[a]. For each transition we do:
        preferences[a] += lr · (r − b) · (1 − π(a))   for the chosen a
        preferences[a] -= lr · (r − b) · π(a)         for the other actions

    This is a scalar trainer — useful as a fallback when no real model is
    plugged in, and as a sanity test for the pipeline.
    """
    if not transitions:
        return dict(preferences)
    # Make sure every action seen has an entry.
    actions = sorted({t.algorithm for t in transitions} | set(preferences.keys()))
    prefs = {a: preferences.get(a, 0.0) for a in actions}
    b = reward_baseline(transitions)

    for t in transitions:
        probs = softmax([prefs[a] for a in actions])
        pi = dict(zip(actions, probs))
        advantage = t.reward - b
        for a in actions:
            indicator = 1.0 if a == t.algorithm else 0.0
            prefs[a] += lr * advantage * (indicator - pi[a])
    return prefs


__all__ = [
    "Transition",
    "load_transitions",
    "reward_baseline",
    "action_advantages",
    "policy_statistics",
    "update_preferences",
    "softmax",
]
