"""Speech-to-text helpers for EUDORA."""

import os

import httpx


STT_PROVIDER = "groq-whisper"  # Options: groq-whisper, browser
GROQ_STT_MODEL = "whisper-large-v3-turbo"


async def transcribe(
    audio_bytes: bytes,
    filename: str = "recording.webm",
    content_type: str = "audio/webm",
) -> str:
    """Transcribe microphone audio with Groq Whisper."""
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not set")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files={"file": (filename, audio_bytes, content_type)},
            data={"model": GROQ_STT_MODEL},
        )
        response.raise_for_status()
        return response.json().get("text", "").strip()
