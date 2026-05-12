import os
import json
import httpx

CEREBRAS_API_KEY = os.getenv("CEREBRAS_API_KEY")
CEREBRAS_MODEL = "llama-3.3-70b"


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


async def route_query_cerebras(user_input: str) -> list[dict]:
    """Ask Cerebras to convert a user routing request into EUDORA tool calls."""
    try:
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
        payload = {
            "model": CEREBRAS_MODEL,
            "messages": messages,
            "max_tokens": 512,
            "temperature": 0,
        }
        headers = {
            "Authorization": f"Bearer {CEREBRAS_API_KEY}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://api.cerebras.ai/v1/chat/completions",
                headers=headers,
                json=payload,
            )

        response_text = response.json()["choices"][0]["message"]["content"]
        return _parse_tool_calls(response_text)
    except Exception as error:
        print(error)
        return []
