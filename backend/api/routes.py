from fastapi import APIRouter
from backend.routing.graph_builder import build_graph
from backend.routing.routing_engine import weighted_directional_route
from backend.signal.signal_model import SignalModel

router = APIRouter()

# Load graph once (not every request)
G = build_graph()
signal_model = SignalModel(G)


def route_to_geojson(G, route):

    coordinates = []

    for node in route:
        lat = G.nodes[node]["y"]
        lng = G.nodes[node]["x"]
        coordinates.append([lng, lat])

    return {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": coordinates
        },
        "properties": {}
    }


@router.get("/get-routes")
def get_routes(start_lat: float, start_lng: float, end_lat: float, end_lng: float):

    fastest = weighted_directional_route(
        G, start_lat, start_lng, end_lat, end_lng,
        w_time=1.0, w_signal=0.1, w_turn=0.2, w_hierarchy=0.3
    )

    practical = weighted_directional_route(
        G, start_lat, start_lng, end_lat, end_lng,
        w_time=1.0, w_signal=0.8, w_turn=0.6, w_hierarchy=1.0
    )

    least_signal = weighted_directional_route(
        G, start_lat, start_lng, end_lat, end_lng,
        w_time=0.4, w_signal=2.0, w_turn=1.0, w_hierarchy=1.5
    )

    return {
        "fastest": {
            "route": route_to_geojson(G, fastest["route"]),
            "time_min": fastest["time_min"],
            "distance_km": fastest["distance_km"],
            "signals": fastest["signals"]
        },
        "practical": {
            "route": route_to_geojson(G, practical["route"]),
            "time_min": practical["time_min"],
            "distance_km": practical["distance_km"],
            "signals": practical["signals"]
        },
        "least_signal": {
            "route": route_to_geojson(G, least_signal["route"]),
            "time_min": least_signal["time_min"],
            "distance_km": least_signal["distance_km"],
            "signals": least_signal["signals"]
        }
    }