import os
from dotenv import load_dotenv
load_dotenv(dotenv_path="../.env")
import httpx

GROQ_RESPONDER_KEY = os.getenv("GROQ_RESPONDER_KEY")
GROQ_MODEL = "llama-3.3-70b-versatile"


def compress_results(tool_results: list) -> list:
    compressed = []
    for result in tool_results:
        if result.get("tool") == "get_routes" and result.get("status") == "success":
            try:
                route = result["result"]
                compressed.append({
                    "tool": result["tool"],
                    "status": result["status"],
                    "result": {
                        "fastest_km": route["fastest"]["distance_km"],
                        "fastest_min": route["fastest"]["time_min"],
                        "fastest_signals": route["fastest"]["signals"],
                        "least_pollution_score": route["least_pollution"]["pollution_score"]
                    }
                })
            except (KeyError, TypeError):
                compressed.append(result)
        elif result.get("tool") == "geocode":
            try:
                compressed.append({
                    "tool": result["tool"],
                    "result": result["result"][0]["display_name"],
                })
            except (KeyError, TypeError):
                compressed.append(result)
        elif result.get("tool") == "get_nearby_places":
            try:
                predictions = result["result"].get("predictions", [])[:3]
                compressed.append({
                    "tool": result["tool"],
                    "status": result["status"],
                    "result": [
                        {
                            "name": p.get("structured_formatting", {}).get("main_text", ""),
                            "description": p.get("description", ""),
                            "distance_meters": p.get("distance_meters", "")
                        }
                        for p in predictions
                    ],
                })
            except (KeyError, TypeError):
                compressed.append(result)
        elif result.get("tool") == "get_weather":
            try:
                compressed.append({
                    "tool": result["tool"],
                    "status": result["status"],
                    "result": {
                        "temp": result["result"]["main"]["temp"],
                        "feels_like": result["result"]["main"]["feels_like"],
                        "humidity": result["result"]["main"]["humidity"],
                        "description": result["result"]["weather"][0]["description"],
                        "wind_speed": result["result"]["wind"]["speed"]
                    }
                })
            except (KeyError, TypeError):
                compressed.append(result)
        elif result.get("tool") == "get_air_quality":
            try:
                compressed.append({
                    "tool": result["tool"],
                    "result": {"aqi": result["result"]["list"][0]["main"]["aqi"]},
                })
            except (KeyError, TypeError):
                compressed.append(result)
        elif result.get("tool") == "calculate_fuel_cost":
            compressed.append(result)
        else:
            compressed.append(result)
    return compressed


async def generate_response(user_input: str, tool_results: list) -> str:
    try:
        compressed_results = compress_results(tool_results)
        system_prompt = (
            "You are EUDORA, a helpful navigation assistant for Indore, India. "
            "The user asked something and tools were executed to get the data. "
            "Summarize the results in 2-3 natural conversational sentences. "
            "Be concise, friendly, and speak as if you did all the work yourself. "
            "Never mention tool names or JSON."
        )
        payload = {
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"User asked: {user_input}\n\nTool results: {compressed_results}",
                },
            ],
            "temperature": 0.7,
            "max_tokens": 150,
        }
        headers = {
            "Authorization": f"Bearer {GROQ_RESPONDER_KEY}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
            )

        print(f"Groq responder raw response: {response.status_code} {response.text}")
        return response.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"Responder error: {e}")
        import traceback
        traceback.print_exc()
        return "I found your results. Please check the map."


async def chat(user_input: str) -> str:
    try:
        system_prompt = (
            "You are EUDORA, a friendly AI assistant embedded in a navigation app for Indore, India. "
            "You can talk about anything — movies, food, general knowledge, weather, travel tips. "
            "Keep responses short, conversational, and under 3 sentences."
        )
        payload = {
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_input},
            ],
            "temperature": 0.9,
            "max_tokens": 150,
        }
        headers = {
            "Authorization": f"Bearer {GROQ_RESPONDER_KEY}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
            )

        return response.json()["choices"][0]["message"]["content"]
    except Exception:
        return "Sorry, I couldn't process that. Try again."
