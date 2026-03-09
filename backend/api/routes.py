from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from backend.routing.routing_engine import weighted_directional_route

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

DISTANCE_BUDGET_FACTOR_SIGNAL     = 1.8
DISTANCE_BUDGET_FACTOR_POLLUTION  = 1.8
DISTANCE_BUDGET_FACTOR_OVERALL    = 1.5


def route_to_geojson(G, route):
    coordinates = [
        [G.nodes[node]["x"], G.nodes[node]["y"]]
        for node in route
    ]
    return {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": coordinates
        },
        "properties": {}
    }


def extract_signal_coords(G, route):
    coords         = []
    seen_junctions = set()

    for i in range(len(route) - 1):
        u, v = route[i], route[i + 1]
        edge = list(G[u][v].values())[0]

        jid = edge.get("junction_id")
        if jid is not None and jid not in seen_junctions:
            seen_junctions.add(jid)
            coords.append({
                "lat": G.nodes[v]["y"],
                "lng": G.nodes[v]["x"],
            })

    return coords


def build_response(G, result, pollution_model):
    if result is None:
        return None
    pollution = pollution_model.analyze_route(result["route"])
    return {
        "route":           route_to_geojson(G, result["route"]),
        "time_min":        result["time_min"],
        "distance_km":     result["distance_km"],
        "signals":         result["signals"],
        "signal_coords":   extract_signal_coords(G, result["route"]),
        "pollution_score": pollution["pollution_score"],
        "aqi_index":       pollution["aqi_index"],
        "aqi_label":       pollution["aqi_label"],
        "time_multiplier": pollution["time_multiplier"],
    }


# Indore bounding box
INDORE_BBOX = {"min_lat": 22.25, "max_lat": 23.15, "min_lng": 75.45, "max_lng": 76.35}

def _in_indore(lat: float, lng: float) -> bool:
    return (INDORE_BBOX["min_lat"] <= lat <= INDORE_BBOX["max_lat"] and
            INDORE_BBOX["min_lng"] <= lng <= INDORE_BBOX["max_lng"])


@router.get("/get-routes")
@limiter.limit("10/minute")
def get_routes(
    request: Request,
    start_lat: float,
    start_lng: float,
    end_lat: float,
    end_lng: float,
):
    G               = request.app.state.G
    pollution_model = request.app.state.pollution_model

    try:
        if not _in_indore(start_lat, start_lng):
            raise HTTPException(
                status_code=400,
                detail="Start location is outside Indore. This app only covers Indore city."
            )
        if not _in_indore(end_lat, end_lng):
            raise HTTPException(
                status_code=400,
                detail="End location is outside Indore. This app only covers Indore city."
            )

        fastest = weighted_directional_route(
            G, start_lat, start_lng, end_lat, end_lng,
            w_time=1.0, w_signal=0.0, w_turn=0.0,
            w_hierarchy=0.3, w_pollution=0.0,
            max_distance_m=None,
        )

        if fastest is None:
            raise HTTPException(status_code=404, detail="No route found.")

        fastest_m = fastest["distance_km"] * 1000

        least_signal = weighted_directional_route(
            G, start_lat, start_lng, end_lat, end_lng,
            w_time=0.5, w_signal=8.0, w_turn=0.6,
            w_hierarchy=0.0, w_pollution=0.1,
            max_distance_m=fastest_m * DISTANCE_BUDGET_FACTOR_SIGNAL,
        )

        least_pollution = weighted_directional_route(
            G, start_lat, start_lng, end_lat, end_lng,
            w_time=0.3, w_signal=0.5, w_turn=0.3,
            w_hierarchy=0.0, w_pollution=8.0,
            max_distance_m=fastest_m * DISTANCE_BUDGET_FACTOR_POLLUTION,
        )

        overall_best = weighted_directional_route(
            G, start_lat, start_lng, end_lat, end_lng,
            w_time=1.0, w_signal=1.5, w_turn=0.6,
            w_hierarchy=0.5, w_pollution=1.5,
            max_distance_m=fastest_m * DISTANCE_BUDGET_FACTOR_OVERALL,
        )

        if least_signal    is None: least_signal    = fastest
        if least_pollution is None: least_pollution = fastest
        if overall_best    is None: overall_best    = fastest

        return {
            "fastest":         build_response(G, fastest,         pollution_model),
            "least_signal":    build_response(G, least_signal,    pollution_model),
            "least_pollution": build_response(G, least_pollution, pollution_model),
            "overall_best":    build_response(G, overall_best,    pollution_model),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/get-signals")
@limiter.limit("20/minute")
def get_signals(request: Request):
    signal_model = request.app.state.signal_model
    return {
        "signals": [
            {"lat": j["lat"], "lng": j["lng"]}
            for j in signal_model.junctions
        ]
    }