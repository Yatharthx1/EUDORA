import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def get_route_result(origin: str, destination: str, route_type: str) -> str:
    """
    Returns route info.
    Right now it's fake — later you'll connect your real OSMnx routing here.
    """
    routes = {
        "fastest":       f"⚡ Fastest Route\n{origin} → {destination}\nAB Road, ~3.1km, 8 min",
        "cleanest":      f"🍃 Cleanest Air Route\n{origin} → {destination}\nScheme 54, ~4.2km, AQI 67",
        "least_signals": f"🚦 Least Signals Route\n{origin} → {destination}\nRing Road, ~3.8km, only 2 signals",
        "best":          f"✦ Best Overall Route\n{origin} → {destination}\nVijay Nagar bypass, ~3.5km, AQI 72, 3 signals",
    }
    return routes.get(route_type, routes["best"])


def process_chat_message(user_message: str) -> str:

    # Step 1: Ask Groq to understand what user wants
    response = client.chat.completions.create(
        model="llama3-8b-8192",   # fast, free Groq model
        messages=[
            {
                "role": "system",
                "content": """You are a routing assistant for EUDORA, a smart navigation app for Indore, India.

Your ONLY job: extract routing intent from user messages.

Reply ONLY with a JSON object (no extra text, no markdown, no backticks):
{"origin": "place name", "destination": "place name", "route_type": "fastest|cleanest|least_signals|best"}

Rules:
- route_type must be exactly one of: fastest, cleanest, least_signals, best
- "clean air" or "pollution" or "AQI" → cleanest
- "fast" or "quick" or "time" → fastest
- "signals" or "red lights" or "smooth" → least_signals
- "best" or "balanced" or unclear → best
- If you cannot find origin OR destination → {"error": "Please tell me where you're starting from and where you want to go!"}

Examples:
User: cleanest route from vijay nagar to Bengali square
Output: {"origin": "Vijay Nagar", "destination": "Bengali Square", "route_type": "cleanest"}

User: go to college fast
Output: {"error": "Please tell me where you're starting from and where you want to go!"}"""
            },
            {
                "role": "user",
                "content": user_message
            }
        ],
        temperature=0,       # 0 = consistent, no creativity needed here
        max_tokens=150,
    )

    raw = response.choices[0].message.content.strip()

    try:
        raw = raw.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return "Sorry, I didn't understand that. Try saying: 'Cleanest route from Vijay Nagar to Bengali Square'"

    if "error" in parsed:
        return parsed["error"]

    origin      = parsed.get("origin", "your location")
    destination = parsed.get("destination", "destination")
    route_type  = parsed.get("route_type", "best")

    result = get_route_result(origin, destination, route_type)

    return f"{result}\n\n💬 Want a different option? Try: fastest, cleanest air, least signals, or best overall!"