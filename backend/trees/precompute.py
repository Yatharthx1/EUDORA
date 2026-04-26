"""Offline precomputation of canopy scores for Indore road segments."""
from dotenv import load_dotenv
load_dotenv()
import argparse
import logging
import pickle
from pathlib import Path

import numpy as np
import osmnx as ox
from tqdm import tqdm

from backend.trees.canopy import canopy_coverage
from backend.trees import fetch_route_ndvi_array
from backend.trees import load_tree_store
from backend.trees import save_tree_store
from backend.trees import update_canopy_score


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PKL_GRAPH_PATH = PROJECT_ROOT / "indore.pkl"
GRAPHML_GRAPH_PATH = PROJECT_ROOT / "indore.graphml"
CHECKPOINT_INTERVAL = 50


def _load_graph():
    """Load the Indore OSM graph from pickle if present, otherwise GraphML."""

    if PKL_GRAPH_PATH.exists():
        with PKL_GRAPH_PATH.open("rb") as graph_file:
            return pickle.load(graph_file)

    return ox.load_graphml(GRAPHML_GRAPH_PATH)


def _edge_coordinates(graph, u, v, data) -> list[tuple[float, float]]:
    """Return edge route coordinates as ``(lat, lng)`` pairs."""

    geometry = data.get("geometry")
    if geometry is not None:
        return [(float(lat), float(lng)) for lng, lat, *_ in geometry.coords]

    source = graph.nodes[u]
    target = graph.nodes[v]
    return [
        (float(source["y"]), float(source["x"])),
        (float(target["y"]), float(target["x"])),
    ]


def main() -> None:
    from backend.trees import initialize_earth_engine
    initialize_earth_engine()
    parser = argparse.ArgumentParser(
        description="Precompute canopy coverage scores for Indore road segments."
    )
    parser.add_argument("--start-date", default="2024-01-01")
    parser.add_argument("--end-date", default="2024-12-31")
    args = parser.parse_args()

    graph = _load_graph()
    edges = list(graph.edges(keys=True, data=True))
    edges = edges[:100]
    store = load_tree_store()

    logging.info("Starting canopy score precompute for %s edges", len(edges))

    for edge_index, (u, v, key, data) in enumerate(
        tqdm(edges, desc="Precomputing canopy scores"),
        start=1,
    ):
        segment_id = f"{u}_{v}_{key}"

        try:
            route_coords = _edge_coordinates(graph, u, v, data)
            ndvi_array = fetch_route_ndvi_array(
                route_coords,
                start_date=args.start_date,
                end_date=args.end_date,
            )
            score = canopy_coverage(np.asarray(ndvi_array, dtype=np.float32))
            update_canopy_score(segment_id, score, store)
        except Exception as exc:
            logging.warning(
                "Skipping edge %s after canopy precompute failure: %s",
                segment_id,
                exc,
            )

        if edge_index % CHECKPOINT_INTERVAL == 0:
            save_tree_store(store)
            logging.info("Saved checkpoint after %s edges", edge_index)

    save_tree_store(store)
    logging.info("Completed canopy score precompute for %s edges", len(edges))


if __name__ == "__main__":
    main()
