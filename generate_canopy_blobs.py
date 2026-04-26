import json
import pickle
from pathlib import Path

import osmnx
from tqdm import tqdm


SCORE_THRESHOLD = 0.5
MAX_BLOBS = 3000


PROJECT_ROOT = Path(__file__).resolve().parent
PKL_GRAPH_PATH = PROJECT_ROOT / "indore.pkl"
GRAPHML_GRAPH_PATH = PROJECT_ROOT / "indore.graphml"
CANOPY_SCORES_PATH = PROJECT_ROOT / "data" / "canopy_scores.json"
CANOPY_BLOBS_PATH = PROJECT_ROOT / "data" / "canopy_blobs.json"


def load_graph():
    if PKL_GRAPH_PATH.exists():
        with PKL_GRAPH_PATH.open("rb") as graph_file:
            return pickle.load(graph_file)

    return osmnx.load_graphml(GRAPHML_GRAPH_PATH)


def load_canopy_scores() -> dict[str, float]:
    with CANOPY_SCORES_PATH.open("r", encoding="utf-8") as scores_file:
        return json.load(scores_file)


def edge_centroid(graph, u, v, data) -> tuple[float, float]:
    geometry = data.get("geometry")
    if geometry is not None:
        centroid = geometry.centroid
        return round(float(centroid.y), 5), round(float(centroid.x), 5)

    source = graph.nodes[u]
    target = graph.nodes[v]
    lat = (float(source["y"]) + float(target["y"])) / 2.0
    lng = (float(source["x"]) + float(target["x"])) / 2.0
    return round(lat, 5), round(lng, 5)


def main() -> None:
    graph = load_graph()
    canopy_scores = load_canopy_scores()
    checked = 0
    qualifying = []

    for u, v, key, data in tqdm(graph.edges(keys=True, data=True), desc="Scanning canopy scores"):
        checked += 1
        segment_id = f"{u}_{v}_{key}"
        score = canopy_scores.get(segment_id)
        if score is None or score <= SCORE_THRESHOLD:
            continue

        lat, lng = edge_centroid(graph, u, v, data)
        qualifying.append(
            {
                "lat": lat,
                "lng": lng,
                "score": round(float(score), 4),
            }
        )

    qualifying.sort(key=lambda blob: blob["score"], reverse=True)
    blobs = qualifying[:MAX_BLOBS]

    CANOPY_BLOBS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CANOPY_BLOBS_PATH.open("w", encoding="utf-8") as blobs_file:
        json.dump(blobs, blobs_file, separators=(",", ":"))

    print(f"Total segments checked: {checked}")
    print(f"Qualifying segments found: {len(qualifying)}")
    print(f"Blobs saved: {len(blobs)}")


if __name__ == "__main__":
    main()
