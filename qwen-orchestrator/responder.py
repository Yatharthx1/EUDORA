import os
from dotenv import load_dotenv
load_dotenv(dotenv_path="../.env")
import httpx

GROQ_RESPONDER_KEY = os.getenv("GROQ_RESPONDER_KEY") or os.getenv("GROQ_API_KEY")
_raw_responder_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
_responder_candidates = [_raw_responder_model]
if _raw_responder_model == "gpt-oss-120b":
    _responder_candidates.insert(0, "openai/gpt-oss-120b")
elif _raw_responder_model == "openai/gpt-oss-120b":
    _responder_candidates.append("gpt-oss-120b")

_responder_candidates.extend(["llama-3.3-70b-versatile", "llama-3.1-8b-instant"])
GROQ_MODELS = list(dict.fromkeys(_responder_candidates))


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
                raw_res = result.get("result", {})
                predictions = raw_res.get("predictions", []) if isinstance(raw_res, dict) else []
                places = []
                for p in predictions[:3]:
                    if isinstance(p, dict):
                        name = (
                            p.get("structured_formatting", {}).get("main_text")
                            or p.get("name")
                            or p.get("description")
                            or "Nearby place"
                        )
                        desc = p.get("description", "")
                        dist = p.get("distance_meters", "")
                        places.append({"name": name, "description": desc, "distance_meters": dist})
                compressed.append({
                    "tool": result["tool"],
                    "status": result.get("status", "success"),
                    "result": places,
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


def _fallback_summary(user_input: str, tool_results: list) -> str:
    parts = []
    dest_name = ""
    route_info = ""

    for res in tool_results:
        if res.get("tool") == "geocode" and res.get("status") == "success":
            try:
                dest_name = res["result"][0]["display_name"].split(",")[0]
            except Exception:
                pass

    for res in tool_results:
        if res.get("tool") == "get_routes" and res.get("status") == "success":
            try:
                r = res["result"]["fastest"]
                dest_str = f" to {dest_name}" if dest_name else ""
                route_info = f"I found a route{dest_str} ({r['distance_km']} km, ~{r['time_min']} mins)."
                parts.append(route_info)
            except Exception:
                pass

    for res in tool_results:
        if res.get("tool") == "get_weather" and res.get("status") == "success":
            try:
                w = res["result"]
                temp = w.get("main", {}).get("temp")
                desc = w.get("weather", [{}])[0].get("description", "clear")
                if temp is not None:
                    parts.append(f"The weather outside is currently {temp}°C with {desc}.")
            except Exception:
                pass

    for res in tool_results:
        if res.get("tool") == "get_nearby_places" and res.get("status") == "success":
            try:
                raw = res.get("result", {})
                preds = raw.get("predictions", [])[:2] if isinstance(raw, dict) else []
                names = []
                for p in preds:
                    if isinstance(p, dict):
                        n = (
                            p.get("structured_formatting", {}).get("main_text")
                            or p.get("name")
                            or p.get("description")
                        )
                        if n:
                            names.append(n.split(",")[0])
                if names:
                    parts.append(f"Nearby places on your way: {', '.join(names)}.")
            except Exception:
                pass

    for res in tool_results:
        if res.get("tool") == "get_air_quality" and res.get("status") == "success":
            try:
                aqi = res["result"]["list"][0]["main"]["aqi"]
                parts.append(f"The air quality index is level {aqi}.")
            except Exception:
                pass

    for res in tool_results:
        if res.get("tool") == "calculate_fuel_cost" and res.get("status") == "success":
            try:
                cost = res["result"].get("fuel_cost_inr")
                if cost:
                    parts.append(f"Estimated fuel cost: ₹{cost}.")
            except Exception:
                pass

    if parts:
        res_str = " ".join(parts)
        if route_info and "say go or start navigation" not in res_str.lower():
            res_str += " Say go or start navigation when you are ready to begin."
        return res_str

    return "I found your results. Say go or start navigation when you are ready to begin."


async def generate_response(user_input: str, tool_results: list) -> str:
    if not GROQ_RESPONDER_KEY:
        return _fallback_summary(user_input, tool_results)

    compressed_results = compress_results(tool_results)
    system_prompt = (
        "You are EUDORA, a helpful, intelligent AI navigation assistant for Indore, India. "
        "The user sent a message that may contain one or multiple requests (such as route navigation, weather conditions, nearby places like restaurants/petrol pumps, fuel cost, etc.). "
        "Tools were executed and their outputs are provided in Tool results. "
        "Synthesize all the tool results into a clear, natural, friendly, and conversational response (2-3 sentences) that directly answers EVERY part of the user's query. "
        "Never mention tool names, status codes, or JSON. "
        "If a route was generated, end your response by saying: say go or start navigation when you are ready to begin."
    )
    headers = {
        "Authorization": f"Bearer {GROQ_RESPONDER_KEY}",
        "Content-Type": "application/json",
    }

    for model in GROQ_MODELS:
        try:
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": f"User asked: {user_input}\n\nTool results: {compressed_results}",
                    },
                ],
                "temperature": 0.7,
                "max_tokens": 512,
            }
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers=headers,
                    json=payload,
                )

            if response.status_code == 200:
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                finish_reason = data["choices"][0].get("finish_reason", "")
                if not content or not content.strip():
                    print(f"[Groq Responder] Model {model} returned empty content, trying next model")
                elif finish_reason == "length":
                    print(f"[Groq Responder] Model {model} response truncated (finish_reason=length), using fallback")
                    return _fallback_summary(user_input, tool_results)
                else:
                    return content
            else:
                print(f"[Groq Responder] Model {model} status {response.status_code}: {response.text}")
        except Exception as e:
            print(f"[Groq Responder] Error with {model}: {e}")

    return _fallback_summary(user_input, tool_results)


async def chat(user_input: str) -> str:
    if not GROQ_RESPONDER_KEY:
        return "I am EUDORA, your AI navigation assistant for Indore. How can I help you with your route today?"

    system_prompt = (
        "You are EUDORA, a friendly AI assistant embedded in a navigation app for Indore, India. "
        "You can talk about anything — movies, food, general knowledge, weather, travel tips. "
        "Keep responses short, conversational, and under 3 sentences."
    )
    headers = {
        "Authorization": f"Bearer {GROQ_RESPONDER_KEY}",
        "Content-Type": "application/json",
    }

    for model in GROQ_MODELS:
        try:
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_input},
                ],
                "temperature": 0.9,
                "max_tokens": 150,
            }
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers=headers,
                    json=payload,
                )

            if response.status_code == 200:
                content = response.json()["choices"][0]["message"]["content"]
                if content and content.strip():
                    return content
                print(f"[Groq Chat] Model {model} returned empty content, trying next model")
            else:
                print(f"[Groq Chat] Model {model} status {response.status_code}: {response.text}")
        except Exception as e:
            print(f"[Groq Chat] Error with {model}: {e}")

    return "I am EUDORA, your AI navigation assistant for Indore. How can I help you with your route today?"
