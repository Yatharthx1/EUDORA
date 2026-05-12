"""FastAPI entrypoint for the EUDORA Qwen orchestrator."""

import asyncio
import inspect
import os
import re
import time
from typing import Any

from fastapi import FastAPI, UploadFile, File, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from groq_orchestrator import route_query_groq
from cerebras_orchestrator import route_query_cerebras
from responder import generate_response, chat
from stt import transcribe
from tts import synthesize
from tool import calculate_fuel_cost, geocode, get_air_quality, get_nearby_places, get_routes, get_signals, get_weather, health_check, reverse_geocode


session_state = {
    "pending_route": None,
    "pending_origin": None,
    "pending_destination": None,
}

INDORE_BBOX = {"min_lat": 22.25, "max_lat": 23.15, "min_lng": 75.45, "max_lng": 76.35}


app = FastAPI(title="EUDORA Qwen Orchestrator")
LOCAL_DEV = os.getenv("EUDORA_LOCAL_DEV", "1").lower() not in {"0", "false", "no"}
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if LOCAL_DEV else ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

_RATE_LIMIT_WINDOW_SECONDS = 60
_RATE_LIMIT_MAX_REQUESTS = int(os.getenv("ORCHESTRATOR_RATE_LIMIT_PER_MINUTE", "30"))
_rate_limit_hits: dict[str, list[float]] = {}


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if LOCAL_DEV or request.url.path == "/health":
        return await call_next(request)

    forwarded_for = request.headers.get("x-forwarded-for", "")
    client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else (request.client.host if request.client else "unknown")
    now = time.time()
    hits = [
        hit
        for hit in _rate_limit_hits.get(client_ip, [])
        if now - hit < _RATE_LIMIT_WINDOW_SECONDS
    ]
    if len(hits) >= _RATE_LIMIT_MAX_REQUESTS:
        return JSONResponse(status_code=429, content={"error": "Too many requests. Please slow down."})

    hits.append(now)
    _rate_limit_hits[client_ip] = hits
    return await call_next(request)

class CurrentLocation(BaseModel):
    lat: float
    lon: float
    label: str | None = None


class QueryRequest(BaseModel):
    """Request body for orchestrated user queries."""

    user_input: str
    current_location: CurrentLocation | None = None


class TTSRequest(BaseModel):
    text: str


TOOLS = {
    "get_routes": get_routes,
    "geocode": geocode,
    "reverse_geocode": reverse_geocode,
    "get_signals": get_signals,
    "health_check": health_check,
    "get_nearby_places": get_nearby_places,
    "get_weather": get_weather,
    "get_air_quality": get_air_quality,
    "calculate_fuel_cost": calculate_fuel_cost,
    "chat": lambda message: chat(message),
}


async def route_query_with_fallback(user_input: str) -> list[dict]:
    tool_calls = await route_query_groq(user_input)
    if tool_calls:
        print("Groq succeeded")
        return tool_calls

    print("Groq failed, trying Cerebras...")
    tool_calls = await route_query_cerebras(user_input)
    if tool_calls:
        print("Cerebras succeeded")
        return tool_calls

    if os.getenv("EUDORA_ENABLE_LOCAL_QWEN", "0").lower() in {"1", "true", "yes"}:
        print("Cerebras failed, trying Qwen...")
        try:
            from orchestrator import route_query as route_query_qwen

            tool_calls = route_query_qwen(user_input)
            if tool_calls:
                print("Qwen succeeded")
                return tool_calls
        except Exception as exception:
            print(f"Qwen failed: {exception}")

    print("All orchestrators failed")
    return []


def is_navigation_confirmation(text: str) -> bool:
    keywords = ["go", "start", "navigate", "let's go", "lets go", "go ahead",
                "start navigation", "begin", "yes", "yeah", "yep", "ok", "okay", "chalo", "haan"]
    text_lower = text.lower().strip()
    return any(text_lower == k or text_lower.startswith(k) for k in keywords)


def _first_geocode_coordinates(result: Any) -> tuple[Any, Any] | None:
    """Extract lat/lon from the first geocode result item."""
    if not isinstance(result, list) or not result:
        return None

    first_result = result[0]
    if not isinstance(first_result, dict):
        return None

    lat = first_result.get("lat")
    lon = first_result.get("lon")
    if lat is None or lon is None:
        return None

    return lat, lon


def _as_float_coordinates(coordinates: tuple[Any, Any] | None) -> tuple[float, float] | None:
    if coordinates is None:
        return None

    try:
        lat = float(coordinates[0])
        lon = float(coordinates[1])
    except (TypeError, ValueError):
        return None

    return lat, lon


def _is_in_indore(lat: float, lon: float) -> bool:
    return (
        INDORE_BBOX["min_lat"] <= lat <= INDORE_BBOX["max_lat"]
        and INDORE_BBOX["min_lng"] <= lon <= INDORE_BBOX["max_lng"]
    )


def _is_current_location_query(query: str) -> bool:
    normalized = query.lower()
    return (
        "current location" in normalized
        or "my location" in normalized
        or "user location" in normalized
        or "user's location" in normalized
        or "user's current location" in normalized
    )


def _contains_route_intent(text: str) -> bool:
    text_lower = text.lower()
    route_keywords = (
        "take me",
        "navigate",
        "direction",
        "directions",
        "route",
        "go to",
        "drive to",
        "lead me",
        "way to",
    )
    return any(keyword in text_lower for keyword in route_keywords)


def _has_explicit_origin(text: str) -> bool:
    return re.search(r"\bfrom\b.+\bto\b", text, flags=re.IGNORECASE) is not None


def _clean_place_query(place: str) -> str:
    cleaned = re.sub(r"\b(please|pls|now|right now)\b", " ", place, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .,!?")
    if cleaned and "indore" not in cleaned.lower():
        cleaned = f"{cleaned}, Indore"
    return cleaned


def _extract_direct_route_places(text: str) -> tuple[str | None, str] | None:
    text = re.sub(r"\s+", " ", text).strip()
    patterns_with_origin = (
        r"^(?:route|directions?|navigate|take me|drive|go)\s+from\s+(.+?)\s+to\s+(.+)$",
        r"^from\s+(.+?)\s+to\s+(.+)$",
    )
    for pattern in patterns_with_origin:
        match = re.match(pattern, text, flags=re.IGNORECASE)
        if match:
            origin = _clean_place_query(match.group(1))
            destination = _clean_place_query(match.group(2))
            return (origin, destination) if origin and destination else None

    patterns_to_destination = (
        r"^(?:take me to|navigate to|directions? to|route to|drive to|go to|lead me to|show me the way to)\s+(.+)$",
        r"^(?:take me|navigate|directions?|route|drive|lead me)\s+(.+)$",
    )
    for pattern in patterns_to_destination:
        match = re.match(pattern, text, flags=re.IGNORECASE)
        if match:
            destination = _clean_place_query(match.group(1))
            return (None, destination) if destination else None

    return None


def _route_ready_message(route_data: dict[str, Any], destination_name: str) -> str:
    best = route_data.get("overall_best") or route_data.get("fastest") or {}
    distance = best.get("distance_km")
    duration = best.get("time_min")

    if distance is not None and duration is not None:
        return (
            f"I found a route to {destination_name}. "
            f"The best option is about {distance} km and {duration} minutes. "
            "Say go or start navigation when you are ready to begin."
        )

    return (
        f"I found a route to {destination_name}. "
        "Say go or start navigation when you are ready to begin."
    )


async def _handle_direct_route_request(request: QueryRequest) -> dict[str, Any] | None:
    route_places = _extract_direct_route_places(request.user_input)
    if route_places is None:
        return None

    origin_query, destination_query = route_places
    if origin_query is not None and _is_current_location_query(origin_query):
        origin_query = None

    if origin_query is None and request.current_location is None:
        return {
            "ai_response": "I need your current location to route from where you are. Please allow location access, then ask me again.",
            "type": "chat",
        }

    try:
        if origin_query is not None:
            origin_result, destination_result = await asyncio.gather(
                geocode(origin_query),
                geocode(destination_query),
            )
            origin = _as_float_coordinates(_first_geocode_coordinates(origin_result))
        else:
            destination_result = await geocode(destination_query)
            origin = (request.current_location.lat, request.current_location.lon)

        destination = _as_float_coordinates(_first_geocode_coordinates(destination_result))
        if origin is None or destination is None:
            return {
                "ai_response": "I could not confidently identify the destination. Please say the place name again, for example: take me to SICA Nipania.",
                "type": "chat",
            }
        if not _is_in_indore(origin[0], origin[1]) or not _is_in_indore(destination[0], destination[1]):
            return {
                "ai_response": "That route appears to be outside Indore. EUDORA currently supports routes inside Indore only.",
                "type": "chat",
            }

        origin_lat, origin_lon = origin
        dest_lat, dest_lon = destination
        route_data = await get_routes(origin_lat, origin_lon, dest_lat, dest_lon)
    except Exception:
        return {
            "ai_response": "I could not calculate that route right now. Please try again in a moment.",
            "type": "chat",
        }

    session_state["pending_route"] = route_data
    if origin_query is not None:
        session_state["pending_origin"] = origin_query
    elif request.current_location is not None:
        session_state["pending_origin"] = request.current_location.label
    else:
        session_state["pending_origin"] = None
    session_state["pending_destination"] = destination_result

    destination_name = destination_query.replace(", Indore", "")
    return {
        "ai_response": _route_ready_message(route_data, destination_name),
        "type": "tools",
        **route_data,
    }


async def _execute_tool_call(tool_call: dict, skip_get_routes: bool = False) -> dict[str, Any]:
    tool_name = tool_call.get("tool") if isinstance(tool_call, dict) else None
    args = tool_call.get("args", {}) if isinstance(tool_call, dict) else {}

    if skip_get_routes and tool_name == "get_routes":
        return {
            "tool": tool_name,
            "status": "skipped",
            "reason": "route coordinates are computed from verified geocodes/current location",
        }

    if tool_name not in TOOLS:
        return {
            "tool": tool_name,
            "status": "error",
            "reason": "unknown tool",
        }

    try:
        tool_function = TOOLS[tool_name]
        if isinstance(args, dict):
            if asyncio.iscoroutinefunction(tool_function):
                result = await tool_function(**args)
            else:
                result = tool_function(**args)
        elif isinstance(args, list):
            if asyncio.iscoroutinefunction(tool_function):
                result = await tool_function(*args)
            else:
                result = tool_function(*args)
        else:
            raise TypeError("tool args must be an object or array")

        if inspect.isawaitable(result):
            result = await result

        return {
            "tool": tool_name,
            "status": "success",
            "tool_call": tool_call,
            "result": result,
        }
    except Exception as exception:
        return {
            "tool": tool_name,
            "status": "error",
            "reason": str(exception),
        }


def _with_current_location_args(tool_call: dict, request: QueryRequest) -> dict:
    if request.current_location is None or not isinstance(tool_call, dict):
        return tool_call

    tool_name = tool_call.get("tool")
    args = tool_call.get("args")
    if tool_name not in {"get_nearby_places", "get_weather", "get_air_quality"} or not isinstance(args, dict):
        return tool_call

    updated = dict(tool_call)
    updated["args"] = {
        **args,
        "lat": request.current_location.lat,
        "lon": request.current_location.lon,
    }
    return updated


def _geocode_candidates_from_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates = []
    for result in results:
        if result.get("tool") != "geocode" or result.get("status") != "success":
            continue

        tool_call = result.get("tool_call")
        args = tool_call.get("args", {}) if isinstance(tool_call, dict) else {}
        query = args.get("query", "") if isinstance(args, dict) else ""
        coordinates = _as_float_coordinates(_first_geocode_coordinates(result.get("result")))
        if coordinates is None:
            continue

        lat, lon = coordinates
        candidates.append({
            "query": query,
            "lat": lat,
            "lon": lon,
            "is_current_location": _is_current_location_query(query),
            "is_in_indore": _is_in_indore(lat, lon),
        })

    return candidates


async def _route_from_verified_places(
    request: QueryRequest,
    results: list[dict[str, Any]],
) -> dict[str, Any] | None:
    geocode_candidates = _geocode_candidates_from_results(results)
    usable_candidates = [
        candidate
        for candidate in geocode_candidates
        if candidate["is_in_indore"] and not candidate["is_current_location"]
    ]

    if (
        request.current_location is not None
        and len(usable_candidates) >= 1
        and not _has_explicit_origin(request.user_input)
    ):
        origin_lat = request.current_location.lat
        origin_lon = request.current_location.lon
        destination = usable_candidates[-1]
        dest_lat = destination["lat"]
        dest_lon = destination["lon"]
    elif len(usable_candidates) >= 2:
        origin = usable_candidates[0]
        destination = usable_candidates[1]
        origin_lat = origin["lat"]
        origin_lon = origin["lon"]
        dest_lat = destination["lat"]
        dest_lon = destination["lon"]
    elif len(usable_candidates) == 1 and request.current_location is not None:
        origin_lat = request.current_location.lat
        origin_lon = request.current_location.lon
        destination = usable_candidates[0]
        dest_lat = destination["lat"]
        dest_lon = destination["lon"]
    else:
        return None

    if not _is_in_indore(float(origin_lat), float(origin_lon)) or not _is_in_indore(float(dest_lat), float(dest_lon)):
        results.append({
            "tool": "get_routes",
            "status": "error",
            "reason": "Route endpoints must be inside Indore",
            "source": "verified_geocode",
        })
        return None

    try:
        route_data = await get_routes(origin_lat, origin_lon, dest_lat, dest_lon)
    except Exception as exception:
        results.append({
            "tool": "get_routes",
            "status": "error",
            "reason": str(exception),
            "source": "verified_geocode",
        })
        return None

    results.append({
        "tool": "get_routes",
        "status": "success",
        "result": route_data,
        "source": "verified_geocode",
    })
    return route_data


@app.post("/query")
async def query(request: QueryRequest) -> dict[str, Any]:
    """Route a user query through Qwen and execute every requested tool call."""
    tool_calls = await route_query_with_fallback(request.user_input)
    results = []

    for tool_call in tool_calls:
        tool_name = tool_call.get("tool") if isinstance(tool_call, dict) else None
        args = tool_call.get("args", {}) if isinstance(tool_call, dict) else {}

        if tool_name not in TOOLS:
            results.append({
                "tool": tool_name,
                "status": "error",
                "reason": "unknown tool",
            })
            continue

        try:
            tool_function = TOOLS[tool_name]
            if isinstance(args, dict):
                if asyncio.iscoroutinefunction(tool_function):
                    result = await tool_function(**args)
                else:
                    result = tool_function(**args)
            elif isinstance(args, list):
                if asyncio.iscoroutinefunction(tool_function):
                    result = await tool_function(*args)
                else:
                    result = tool_function(*args)
            else:
                raise TypeError("tool args must be an object or array")

            results.append({
                "tool": tool_name,
                "status": "success",
                "result": result,
            })
        except Exception as exception:
            results.append({
                "tool": tool_name,
                "status": "error",
                "reason": str(exception),
            })

    ai_response = await generate_response(request.user_input, results)
    return {
        "tool_calls_requested": tool_calls,
        "results": results,
        "ai_response": ai_response,
    }


@app.post("/voice-query")
async def voice_query(request: Request) -> dict[str, Any]:
    """Transcribe multipart voice input, or handle the legacy JSON voice-query flow."""
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file") or form.get("audio")
        if not hasattr(upload, "read"):
            return {"transcript": "", "error": "No audio file uploaded"}

        try:
            audio_bytes = await upload.read()
            transcript = await transcribe(
                audio_bytes,
                upload.filename or "recording.webm",
                upload.content_type or "audio/webm",
            )
            return {"transcript": transcript}
        except Exception as exception:
            return {"transcript": "", "error": str(exception)}

    body = await request.json()
    query_request = QueryRequest(**body)
    tool_calls = await route_query_with_fallback(query_request.user_input)
    geocode_calls = [
        tool_call
        for tool_call in tool_calls
        if isinstance(tool_call, dict) and tool_call.get("tool") == "geocode"
    ]

    if len(geocode_calls) < 2:
        return {"error": "Could not understand origin and destination"}

    try:
        geocode_tasks = []
        for tool_call in geocode_calls:
            args = tool_call.get("args", {})
            if isinstance(args, dict):
                geocode_tasks.append(geocode(**args))
            elif isinstance(args, list):
                geocode_tasks.append(geocode(*args))
            else:
                return {"error": "Could not geocode one or more locations"}
        geocode_results = await asyncio.gather(*geocode_tasks)
    except Exception:
        return {"error": "Could not geocode one or more locations"}

    origin = _first_geocode_coordinates(geocode_results[0])
    destination = _first_geocode_coordinates(geocode_results[1])
    if origin is None or destination is None:
        return {"error": "Could not geocode one or more locations"}

    origin_lat, origin_lon = origin
    dest_lat, dest_lon = destination
    try:
        route_data = await get_routes(origin_lat, origin_lon, dest_lat, dest_lon)
    except Exception:
        return {"error": "Could not calculate route between those locations"}

    ai_response = await generate_response(query_request.user_input, [{"tool": "get_routes", "result": route_data}])
    return {**route_data, "ai_response": ai_response}


@app.post("/chat")
async def chat_endpoint(request: QueryRequest) -> dict[str, Any]:
    if is_navigation_confirmation(request.user_input) and session_state["pending_route"] is not None:
        route = session_state["pending_route"]
        session_state["pending_route"] = None
        session_state["pending_origin"] = None
        session_state["pending_destination"] = None
        return {"ai_response": "Starting navigation now. Have a safe trip!", "type": "navigation", **route}

    direct_route = await _handle_direct_route_request(request)
    if direct_route is not None:
        return direct_route

    tool_calls = await route_query_with_fallback(request.user_input)
    if not tool_calls:
        response = await chat(request.user_input)
        return {"ai_response": response, "type": "chat"}

    route_intent = _contains_route_intent(request.user_input) or any(
        isinstance(tool_call, dict) and tool_call.get("tool") == "get_routes"
        for tool_call in tool_calls
    )

    execution_tasks = []
    invalid_results = []
    for tool_call in tool_calls:
        if not isinstance(tool_call, dict):
            invalid_results.append({
                "tool": None,
                "status": "error",
                "reason": "invalid tool call",
            })
            continue
        execution_tasks.append(_execute_tool_call(
            _with_current_location_args(tool_call, request),
            skip_get_routes=route_intent,
        ))

    results = invalid_results + await asyncio.gather(*execution_tasks)

    route_data = None
    if route_intent:
        route_data = await _route_from_verified_places(request, results)
        successful_geocodes = [
            result
            for result in results
            if result.get("tool") == "geocode" and result.get("status") == "success"
        ]
        if route_data is None and request.current_location is None and len(successful_geocodes) < 2:
            return {
                "ai_response": "I need your current location to route from where you are. Please allow location access, then ask me again.",
                "type": "chat",
            }
        if route_data is None:
            return {
                "ai_response": "I could not confidently identify the destination. Please say the place name again, for example: take me to SICA Nipania.",
                "type": "chat",
            }

    if route_data is not None:
        session_state["pending_route"] = route_data
        geocode_results = [
            result["result"]
            for result in results
            if result.get("tool") == "geocode" and result.get("status") == "success"
        ]
        session_state["pending_origin"] = geocode_results[0] if len(geocode_results) > 0 else None
        session_state["pending_destination"] = geocode_results[1] if len(geocode_results) > 1 else None

    user_message = request.user_input
    if session_state["pending_route"] is not None:
        user_message += "\n\nIMPORTANT: Route is computed and ready. End your response by saying: say go or start navigation when you are ready to begin."

    response = await generate_response(user_message, results)
    final = {"ai_response": response, "type": "tools"}
    if route_data:
        final.update(route_data)
    return final


@app.post("/tts")
async def tts(request: TTSRequest) -> FileResponse:
    audio_path = await synthesize(request.text)
    return FileResponse(audio_path, media_type="audio/mpeg")


@app.post("/stt")
async def stt(file: UploadFile = File(...)) -> dict[str, str]:
    """Transcribe uploaded audio via Groq Whisper API."""
    try:
        audio_bytes = await file.read()
        transcript = await transcribe(
            audio_bytes,
            file.filename or "recording.webm",
            file.content_type or "audio/webm",
        )
        return {"transcript": transcript}
    except Exception as e:
        return {"transcript": "", "error": str(e)}


@app.get("/health")
async def health() -> dict[str, str]:
    """Return orchestrator service health."""
    return {"status": "ok", "service": "qwen-orchestrator"}
