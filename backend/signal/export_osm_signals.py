import osmnx as ox
import json
import os
from backend.routing.graph_builder import build_graph


def export_osm_signals_registry(
    place_name="Indore, Madhya Pradesh, India",
    output_file="data/signals_registry.json",
    default_cycle=120,
    default_green=55,
    default_yellow=5,
    default_red=60,
    default_start="09:00:00"
):

    print("Loading graph...")
    G = build_graph()

    print("Fetching traffic signals from OSM...")
    tags = {"highway": "traffic_signals"}
    signals = ox.features_from_place(place_name, tags)

    signal_registry = {}
    counter = 1

    print("Processing signals...")

    for _, row in signals.iterrows():

        if row.geometry.geom_type != "Point":
            continue

        lat = row.geometry.y
        lng = row.geometry.x

        # Use geographic deduplication (avoid duplicates close together)


        key = f"osm_{counter}"
        counter += 1

        signal_registry[key] = {
            "lat": lat,
            "lng": lng,
            "source": "osm",
            "cycle_time": default_cycle,
            "green_time": default_green,
            "yellow_time": default_yellow,
            "red_time": default_red,
            "start_reference": default_start
        }

    print(f"Total OSM signals stored: {len(signal_registry)}")

    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    with open(output_file, "w") as f:
        json.dump({"signals": signal_registry}, f, indent=4)

    print(f"Signal registry exported to {output_file}")


if __name__ == "__main__":
    export_osm_signals_registry()
