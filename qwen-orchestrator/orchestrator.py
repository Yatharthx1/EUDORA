"""Qwen-powered routing orchestrator for EUDORA tool calls."""

import json
import shutil
from pathlib import Path

from huggingface_hub import hf_hub_download
from llama_cpp import Llama


MODEL_REPO = "Qwen/Qwen2.5-1.5B-Instruct-GGUF"
MODEL_FILE = "qwen2.5-1.5b-instruct-q4_k_m.gguf"
MODEL_PATH = "./model.gguf"

if not Path(MODEL_PATH).exists():
    downloaded_model_path = hf_hub_download(
        repo_id=MODEL_REPO,
        filename=MODEL_FILE,
    )
    shutil.copyfile(downloaded_model_path, MODEL_PATH)

llama = Llama(model_path=MODEL_PATH, n_ctx=2048, verbose=False)


def _parse_tool_calls(text: str) -> list[dict]:
    """Parse a JSON array of tool calls from the model response."""
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        pass

    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return []

    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return []

    return parsed if isinstance(parsed, list) else []


def route_query(user_input: str) -> list[dict]:
    """Ask Qwen to convert a user routing request into EUDORA tool calls."""
    system_prompt = """You are a routing assistant for a navigation app called EUDORA that serves Indore, India.
Your only job is to return a JSON array of tool calls based on the user message.
Do not explain anything. Do not add any text before or after the JSON array.

Available tools:
- geocode: converts a place name to coordinates. args: {"query": "place name"}
- get_routes: gets routes between two points. args: {"origin_lat": float, "origin_lon": float, "dest_lat": float, "dest_lon": float}
- reverse_geocode: converts coordinates to a place name. args: {"lat": float, "lon": float}
- get_signals: gets traffic signal locations. args: {}
- health_check: checks if EUDORA backend is alive. args: {}
- get_nearby_places: finds nearby places by category. args: {"lat": float, "lon": float, "types": "restaurant"|"hotel"|"hospital"|"petrol_station"|"atm", "radius": int}
- get_weather: gets current weather in Indore. args: {"lat": float, "lon": float}
- get_air_quality: gets current air quality in Indore. args: {"lat": float, "lon": float}
- calculate_fuel_cost: estimates fuel cost for a trip. args: {"distance_km": float, "fuel_price_per_litre": float, "mileage_kmpl": float}
- chat: for any general conversation, questions about movies, food, sports, general knowledge, or anything not related to navigation. args: {"message": "user's message"}

Examples:
User: "Route from Rajwada to Vijay Nagar"
[{"tool": "geocode", "args": {"query": "Rajwada, Indore"}}, {"tool": "geocode", "args": {"query": "Vijay Nagar, Indore"}}, {"tool": "get_routes", "args": {"origin_lat": 22.7196, "origin_lon": 75.8577, "dest_lat": 22.7534, "dest_lon": 75.8937}}]

User: "Find restaurants near me"
[{"tool": "get_nearby_places", "args": {"lat": 22.7196, "lon": 75.8577, "types": "restaurant", "radius": 2000}}]

User: "What is the weather today"
[{"tool": "get_weather", "args": {"lat": 22.7196, "lon": 75.8577}}]

User: "How much fuel will I need to go 10km"
[{"tool": "calculate_fuel_cost", "args": {"distance_km": 10}}]

User: "What are some good movies to watch?"
[{"tool": "chat", "args": {"message": "What are some good movies to watch?"}}]

Return only the JSON array. Nothing else."""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_input},
    ]

    response = llama.create_chat_completion(
        messages,
        max_tokens=512,
    )
    response_text = response["choices"][0]["message"]["content"].strip()
    return _parse_tool_calls(response_text)
