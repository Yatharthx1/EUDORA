"""
graph_builder.py

Builds or loads the Indore road network graph.

Speed philosophy
----------------
The speed table here is a FALLBACK only — it applies to edges that
TomTom's IDW radius never reaches (deep residential lanes, service roads).

For every edge that TomTom covers:
  - base_time  ← derived from TomTom freeFlowSpeed  (no-congestion travel time)
  - live_time  ← derived from TomTom currentSpeed   (real travel time right now)

For edges TomTom doesn't cover (fallback):
  - base_time  ← length / ROAD_SPEEDS_KMPH[road_type]
  - live_time  ← same as base_time (no live data available)

This means the routing engine always uses the best available data:
  edge_cost uses live_time if present, falls back to base_time.
"""

import os
import osmnx as ox

# ── Fallback speeds (km/h) ────────────────────────────────────────────────────
# Used ONLY for edges outside TomTom's 800m IDW radius.
# These are conservative averages including typical stop delays.
ROAD_SPEEDS_KMPH = {
    "motorway":       65.0,
    "motorway_link":  50.0,
    "trunk":          45.0,
    "trunk_link":     35.0,
    "primary":        25.0,
    "primary_link":   20.0,
    "secondary":      20.0,
    "secondary_link": 18.0,
    "tertiary":       18.0,
    "tertiary_link":  15.0,
    "residential":    14.0,
    "living_street":  10.0,
    "service":        10.0,
    "unclassified":   16.0,
}
DEFAULT_SPEED_KMPH = 18.0

# ── Road traffic volume (for pollution model) ─────────────────────────────────
ROAD_TRAFFIC_VOLUME = {
    "motorway":       0.7,
    "motorway_link":  0.6,
    "trunk":          0.9,
    "trunk_link":     0.8,
    "primary":        1.8,
    "primary_link":   1.5,
    "secondary":      1.5,
    "secondary_link": 1.3,
    "tertiary":       1.1,
    "tertiary_link":  1.0,
    "residential":    0.6,
    "living_street":  0.4,
    "service":        0.4,
    "unclassified":   0.8,
}
DEFAULT_TRAFFIC_VOLUME = 0.9

# ── Major road types (no road_penalty) ───────────────────────────────────────
MAJOR_ROAD_TYPES = {
    "motorway", "motorway_link",
    "trunk", "trunk_link",
    "primary", "primary_link",
    "secondary", "secondary_link",
}


def _road_speed(data: dict) -> float:
    """Fallback speed for an edge based on its road type."""
    road_type = data.get("highway", "")
    if isinstance(road_type, list):
        road_type = road_type[0]
    return ROAD_SPEEDS_KMPH.get(road_type, DEFAULT_SPEED_KMPH)


def _compute_edge_times(G):
    """
    Set base_time and road_penalty for every edge using the fallback
    speed table. TomTom will overwrite base_time and live_time later
    for major road edges — this only needs to be correct for the rest.

    Called at build time and on every load (recalculates in memory,
    never touches the GraphML file).
    """
    for u, v, k, data in G.edges(keys=True, data=True):
        length_m  = float(data.get("length") or 0)
        length_km = length_m / 1000.0

        data["length"] = length_m

        # Only recalculate base_time here if TomTom hasn't set it yet.
        # After enrichment, base_time is derived from freeFlowSpeed.
        # We always recalculate to apply current speed table on load.
        speed = _road_speed(data)
        data["base_time"] = round((length_km / max(speed, 1.0)) * 60.0, 6)

        # traffic_factor: preserve enriched value if present, else 1.0
        if "traffic_factor" not in data or data.get("traffic_factor") == "":
            data["traffic_factor"] = 1.0
        else:
            try:
                data["traffic_factor"] = float(data["traffic_factor"])
            except (ValueError, TypeError):
                data["traffic_factor"] = 1.0

        road_type = data.get("highway", "")
        if isinstance(road_type, list):
            road_type = road_type[0]

        data["road_penalty"] = 0.0 if road_type in MAJOR_ROAD_TYPES else 0.8
        data["time_with_behavior"] = round(
            data["base_time"] + data["road_penalty"], 6
        )

    return G


def sanitize_loaded_graph(G):
    """
    Convert GraphML string attributes back to floats, then recompute
    base_time from the current speed table.

    Note: live_time is NOT reset here — TomTom writes it during
    enrichment. If the cache is fresh, enricher will restore it
    from disk. If cache is stale, enricher fetches fresh data.
    """
    float_fields = [
        "length", "base_time", "traffic_factor", "road_penalty",
        "time_with_behavior", "signal_delay", "time_with_signal",
        "live_time", "pollution_delay", "pollution_exposure",
        "congestion_ratio",
    ]
    for u, v, k, data in G.edges(keys=True, data=True):
        for key in float_fields:
            if key in data:
                try:
                    data[key] = float(data[key])
                except (ValueError, TypeError):
                    data.pop(key, None)

    # Recompute base_time with current speed table
    G = _compute_edge_times(G)
    return G


def prepare_graph(G):
    """Build-time graph preparation — fallback speeds only."""
    return _compute_edge_times(G)


def build_graph(
    place_name="Indore, Madhya Pradesh, India",
    save=True,
    load_if_exists=True,
    filepath="indore.graphml"
):
    if load_if_exists and os.path.exists(filepath):
        print("Loading existing graph from file...")
        G = ox.load_graphml(filepath)
        G = sanitize_loaded_graph(G)
        print("Graph loaded and sanitized.")
        print(f"Nodes: {len(G.nodes)}")
        print(f"Edges: {len(G.edges)}")
        return G

    print(f"Downloading road network for {place_name}...")
    G = ox.graph_from_place(place_name, network_type="drive", simplify=True)
    print(f"Download complete. Nodes: {len(G.nodes)}  Edges: {len(G.edges)}")

    G = prepare_graph(G)
    print("Graph prepared with fallback speeds (TomTom will enrich on startup).")

    if save:
        ox.save_graphml(G, filepath)
        print(f"Graph saved to {filepath}")

    return G


if __name__ == "__main__":
    G = build_graph()
    sample = next(
        (d for u, v, d in G.edges(data=True)
         if d.get("highway") == "primary" and d.get("length", 0) > 100), None
    )
    if sample:
        km   = sample["length"] / 1000
        mins = sample["base_time"]
        spd  = (km / mins) * 60
        print(f"Primary edge check: {km:.3f}km → {mins:.2f}min → {spd:.1f}km/h")