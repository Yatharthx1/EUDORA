import os
import osmnx as ox


def prepare_graph(G, avg_speed_kmph=40.0):
    """
    Ensure all numeric edge attributes are proper floats
    and compute base_time + traffic_factor.
    """
   
    for u, v, k, data in G.edges(keys=True, data=True):

        # Ensure length is numeric
        length_m = float(data.get("length") or 0)

        # Compute travel time
        length_km = length_m / 1000.0
        travel_time_min = (length_km / avg_speed_kmph) * 60.0

        data["length"] = length_m
        data["base_time"] = float(travel_time_min)
        data["traffic_factor"] = 1.0   
        road_type = data.get("highway", "")

        if isinstance(road_type, list):
            road_type = road_type[0]

        major = ["primary", "secondary", "tertiary"]

        if road_type not in major:
            data["road_penalty"] = 0.8   # strong penalty
        else:
            data["road_penalty"] = 0
        data["time_with_behavior"] = (
        data["base_time"]
        + data.get("road_penalty", 0)
        ) 

    return G


def sanitize_loaded_graph(G):
    """
    Convert string attributes from GraphML back to floats.
    """

    for u, v, k, data in G.edges(keys=True, data=True):

        for key in [            "length",
            "base_time",
            "traffic_factor",
            "road_penalty",
            "time_with_behavior",
            "signal_delay",
            "time_with_signal"
]:
            if key in data:
                data[key] = float(data[key])

    return G


def build_graph(
    place_name="Indore, Madhya Pradesh, India",
    save=True,
    load_if_exists=True,
    filepath="indore.graphml"
):

    # If graph already exists and loading allowed
    if load_if_exists and os.path.exists(filepath):
        print("Loading existing graph from file...")
        G = ox.load_graphml(filepath)

        # Convert string attributes back to floats
        G = sanitize_loaded_graph(G)

        print("Graph loaded and sanitized.")
        print(f"Nodes: {len(G.nodes)}")
        print(f"Edges: {len(G.edges)}") 
        return G

    # Otherwise download
    print(f"Downloading road network for {place_name}...")

    G = ox.graph_from_place(
        place_name,
        network_type="drive",
        simplify=True
    )

    print("Download complete.")
    print(f"Nodes: {len(G.nodes)}")
    print(f"Edges: {len(G.edges)}")

    # Prepare graph with travel time attributes
    G = prepare_graph(G)

    print("Graph prepared with base_time and traffic_factor.")

    if save:
        ox.save_graphml(G, filepath)
        print(f"Graph saved to {filepath}")

    return G


# Debug check (optional)
if __name__ == "__main__":
    G = build_graph()
    count = 0
    for u, v, data in G.edges(data=True):
        if data.get("name"):
            count += 1
            
    print(f"Edges with name tag: {count}")

    # Check a specific corridor
    ab_road = [(u,v,d) for u,v,d in G.edges(data=True) 
            if "A. B. Road" in str(d.get("name",""))]
    print(f"AB Road edges found: {len(ab_road)}")
