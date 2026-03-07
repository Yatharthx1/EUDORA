import asyncio
import httpx
import os
from dotenv import load_dotenv
load_dotenv()

async def test():
    key = os.environ.get("TOMTOM_API_KEY")
    print(f"Key loaded: {bool(key)}")
    print(f"Key preview: {key[:8]}..." if key else "NO KEY")
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json",
            params={
                "point": "22.7196,75.8577",  # Indore city centre
                "key": key,
                "unit": "KMPH",
            },
            timeout=10.0,
        )
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:300]}")

asyncio.run(test())