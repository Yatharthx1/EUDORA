from fastapi import APIRouter, HTTPException, Request
from backend.routing.routing_engine import weighted_directional_route

router = APIRouter()

# How much longer than the fastest route we allow.
# 1.4 = 40% longer max. Tune this if routes feel too constrained.
# How much longer than the fastest route we allow per route type.
# Least-signal and least-pollution need more room to find genuinely different
# paths in Indore's grid — side streets that avoid junctions are often 1.7-2x longer.
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


@router.get("/get-routes")
def get_routes(
    request: Request,
    start_lat: float,
    start_lng: float,
    end_lat: float,
    end_lng: float
):
    G               = request.app.state.G
    pollution_model = request.app.state.pollution_model

    try:
        # ── Step 1: run fastest with no distance constraint ───────────────
        fastest = weighted_directional_route(
            G, start_lat, start_lng, end_lat, end_lng,
            w_time=1.0, w_signal=0.0, w_turn=0.0,
            w_hierarchy=0.3, w_pollution=0.0,
            max_distance_m=None,
        )

        if fastest is None:
            raise HTTPException(status_code=404, detail="No route found.")

        # ── Step 2: derive per-route distance budgets ────────────────────
        # Least-signal and least-pollution get a larger budget so they can
        # genuinely detour onto quieter side streets in Indore's grid.
        fastest_m = fastest["distance_km"] * 1000

        # ── Step 3: run the other three routes ────────────────────────────

        # Least signals: strongly avoid signal edges; ignore road hierarchy
        # so the router is free to use residential streets (which have no signals).
        # w_hierarchy=0 — don't punish side streets, that's the whole point.
        least_signal = weighted_directional_route(
            G, start_lat, start_lng, end_lat, end_lng,
            w_time=0.3, w_signal=8.0, w_turn=0.6,
            w_hierarchy=0.0, w_pollution=0.1,
            max_distance_m=fastest_m * DISTANCE_BUDGET_FACTOR_SIGNAL,
        )

        # Least pollution: strongly avoid high traffic_factor edges; also
        # avoid signals (idling = emissions). w_hierarchy=0 same reasoning.
        least_pollution = weighted_directional_route(
            G, start_lat, start_lng, end_lat, end_lng,
            w_time=0.3, w_signal=0.5, w_turn=0.3,
            w_hierarchy=0.0, w_pollution=8.0,
            max_distance_m=fastest_m * DISTANCE_BUDGET_FACTOR_POLLUTION,
        )

        # Overall best: balanced — some time pressure keeps it reasonable,
        # mild signal and pollution awareness, light hierarchy preference.
        overall_best = weighted_directional_route(
            G, start_lat, start_lng, end_lat, end_lng,
            w_time=1.0, w_signal=1.5, w_turn=0.6,
            w_hierarchy=0.5, w_pollution=1.5,
            max_distance_m=fastest_m * DISTANCE_BUDGET_FACTOR_OVERALL,
        )

        # If a specialised route failed, fall back to fastest rather than 404
        if least_signal   is None: least_signal   = fastest
        if least_pollution is None: least_pollution = fastest
        if overall_best   is None: overall_best   = fastest

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
def get_signals(request: Request):
    signal_model = request.app.state.signal_model
    return {
        "signals": [
            {"lat": j["lat"], "lng": j["lng"]}
            for j in signal_model.junctions
        ]
    }