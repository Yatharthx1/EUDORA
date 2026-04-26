"""Tree-density costs for EUDORA route scoring."""

from backend.trees.canopy import canopy_coverage
from backend.trees.tree_store import get_canopy_score
from backend.trees.tree_store import load_tree_store


_STORE: dict[str, float] | None = None


def get_store() -> dict[str, float]:
    """Load and cache the precomputed canopy-score store."""

    global _STORE
    if _STORE is None:
        _STORE = load_tree_store()
    return _STORE


def tree_edge_cost(u: int, v: int, key: int) -> float:
    """Return a 0-1 canopy cost where more canopy means lower cost."""

    segment_id = f"{u}_{v}_{key}"
    score = get_canopy_score(segment_id, get_store())
    return 1.0 - score


def greenest_weight(u: int, v: int, key: int, data: dict) -> float:
    """Combine canopy cost with road-segment length."""

    return data.get("length", 1.0) * (1.0 + tree_edge_cost(u, v, key))


__all__ = [
    "get_store",
    "greenest_weight",
    "tree_edge_cost",
]
