"""Persistence helpers for precomputed Indore road-segment canopy scores."""

import json
import os
from pathlib import Path


DEFAULT_STORE_PATH = str(Path(__file__).resolve().parents[2] / "data" / "canopy_scores.json")


def _validate_canopy_score(score: object, store_path: Path) -> float:
    """Validate and return a canopy score."""

    if not isinstance(score, float) or not 0.0 <= score <= 1.0:
        raise ValueError(
            "Malformed canopy score store JSON: expected float scores between "
            f"0.0 and 1.0 at {store_path}"
        )

    return score


def load_tree_store(path: str = DEFAULT_STORE_PATH) -> dict[str, float]:
    """Load road-segment canopy scores from a JSON store."""

    store_path = Path(path)
    if not store_path.exists():
        return {}

    try:
        with store_path.open("r", encoding="utf-8") as store_file:
            data = json.load(store_file)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Malformed canopy score store JSON: {store_path}") from exc

    if not isinstance(data, dict):
        raise ValueError(f"Malformed canopy score store JSON: expected object at {store_path}")

    store: dict[str, float] = {}
    for segment_id, score in data.items():
        if not isinstance(segment_id, str):
            raise ValueError(
                "Malformed canopy score store JSON: expected string segment IDs "
                f"at {store_path}"
            )
        store[segment_id] = _validate_canopy_score(score, store_path)

    return store


def save_tree_store(store: dict[str, float], path: str = DEFAULT_STORE_PATH) -> None:
    """Atomically save road-segment canopy scores to a JSON store."""

    store_path = Path(path)
    for segment_id, score in store.items():
        if not isinstance(segment_id, str):
            raise ValueError("Canopy score store must use string segment IDs.")
        _validate_canopy_score(score, store_path)

    store_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = store_path.with_name(f"{store_path.name}.tmp")

    with tmp_path.open("w", encoding="utf-8") as store_file:
        json.dump(store, store_file, indent=2)
        store_file.write("\n")

    os.replace(tmp_path, store_path)


def get_canopy_score(segment_id: str, store: dict[str, float], default: float = 0.0) -> float:
    """Return a segment canopy score from the store, or ``default`` if missing."""

    return store.get(segment_id, default)


def update_canopy_score(segment_id: str, score: float, store: dict[str, float]) -> None:
    """Update a segment canopy score in-place."""

    if not isinstance(segment_id, str):
        raise ValueError("Canopy score store must use string segment IDs.")
    store[segment_id] = _validate_canopy_score(score, Path(DEFAULT_STORE_PATH))


__all__ = [
    "DEFAULT_STORE_PATH",
    "get_canopy_score",
    "load_tree_store",
    "save_tree_store",
    "update_canopy_score",
]
