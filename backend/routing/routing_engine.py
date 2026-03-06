import heapq
import math
import osmnx as ox


def turn_penalty(G, A, B, C):

    lat1, lon1 = G.nodes[A]["y"], G.nodes[A]["x"]
    lat2, lon2 = G.nodes[B]["y"], G.nodes[B]["x"]
    lat3, lon3 = G.nodes[C]["y"], G.nodes[C]["x"]

    v1 = (lat2 - lat1, lon2 - lon1)
    v2 = (lat3 - lat2, lon3 - lon2)

    dot  = v1[0]*v2[0] + v1[1]*v2[1]
    mag1 = math.sqrt(v1[0]**2 + v1[1]**2)
    mag2 = math.sqrt(v2[0]**2 + v2[1]**2)

    if mag1 == 0 or mag2 == 0:
        return 0

    angle = math.degrees(math.acos(max(-1, min(1, dot / (mag1 * mag2)))))

    if angle < 15:
        return 0
    elif angle < 60:
        penalty = 1
    else:
        penalty = 3

    cross = v1[0]*v2[1] - v1[1]*v2[0]

    # Right turns are heavier (India drives on left)
    if cross < 0:
        penalty *= 1.5

    return penalty


def summarize_route(G, route):

    total_time     = 0
    total_distance = 0
    seen_junctions = set()  # deduplicate signals by junction_id so that a
                            # multi-node OSM intersection is counted only once,
                            # matching the behaviour of manually-added signals
                            # which are already one entry per junction.

    for i in range(len(route) - 1):
        u    = route[i]
        v    = route[i + 1]
        edge = list(G[u][v].values())[0]

        total_time     += edge.get("base_time", 0)
        total_distance += edge.get("length", 0)

        jid = edge.get("junction_id")
        if jid is not None:
            seen_junctions.add(jid)

    return {
        "route":       route,
        "distance_km": round(total_distance / 1000, 2),
        "time_min":    round(total_time, 2),
        "signals":     len(seen_junctions),
    }


def weighted_directional_route(
        G,
        origin_lat,
        origin_lon,
        dest_lat,
        dest_lon,
        w_time=1.0,
        w_signal=1.0,
        w_turn=1.0,
        w_hierarchy=1.0,
        w_pollution=1.0):
    """
    Dijkstra-based routing with configurable weights for:
      - travel time
      - signal delay
      - turn penalty
      - road hierarchy penalty
      - pollution delay
    """

    origin = ox.distance.nearest_nodes(G, origin_lon, origin_lat)
    dest   = ox.distance.nearest_nodes(G, dest_lon,   dest_lat)

    pq      = []
    visited = {}

    def edge_cost(edge, prev_node=None, curr_node=None, next_node=None):
        cost = (
            w_time      * edge.get("base_time",       0) +
            w_signal    * edge.get("signal_delay",    0) +
            w_hierarchy * edge.get("road_penalty",    0) +
            w_pollution * edge.get("pollution_delay", 0)
        )
        if prev_node and curr_node and next_node:
            cost += w_turn * turn_penalty(G, prev_node, curr_node, next_node)
        return cost

    # Seed with origin's neighbors
    for neighbor in G.successors(origin):
        edge = list(G[origin][neighbor].values())[0]
        cost = edge_cost(edge)
        heapq.heappush(pq, (cost, origin, neighbor, [origin, neighbor]))

    while pq:
        cost, prev, current, path = heapq.heappop(pq)

        state = (prev, current)
        if state in visited and visited[state] <= cost:
            continue
        visited[state] = cost

        if current == dest:
            return summarize_route(G, path)

        for next_node in G.successors(current):
            edge     = list(G[current][next_node].values())[0]
            new_cost = cost + edge_cost(edge, prev, current, next_node)
            heapq.heappush(pq, (new_cost, current, next_node, path + [next_node]))

    return None