import { API_BASE, ORCHESTRATOR_BASE } from "./config";

const STT_TIMEOUT_MS = 12000;

function getAudioFilename(audioBlob) {
  const type = audioBlob?.type || "";
  if (type.includes("mp4")) return "recording.mp4";
  if (type.includes("mpeg")) return "recording.mp3";
  if (type.includes("wav")) return "recording.wav";
  if (type.includes("ogg")) return "recording.ogg";
  return "recording.webm";
}

export async function geocodeSearch(query) {
  if (!query || query.length < 2) return [];
  try {
    const response = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error("Geocode failed");
    return await response.json();
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function reverseGeocode(lat, lon) {
  try {
    const response = await fetch(`${API_BASE}/api/reverse?lat=${lat}&lon=${lon}`);
    if (!response.ok) throw new Error("Reverse geocode failed");
    return await response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function getRoutes(startLat, startLng, endLat, endLng) {
  try {
    const url = `${API_BASE}/api/get-routes?start_lat=${startLat}&start_lng=${startLng}&end_lat=${endLat}&end_lng=${endLng}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Get routes failed");
    return await response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function getSignals() {
  try {
    const response = await fetch(`${API_BASE}/api/get-signals`);
    if (!response.ok) throw new Error("Get signals failed");
    return await response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function chatWithEudora(message, currentLocation = null) {
  try {
    const response = await fetch(`${ORCHESTRATOR_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_input: message, current_location: currentLocation }),
    });
    if (!response.ok) throw new Error("Chat failed");
    return await response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function textToSpeech(text) {
  try {
    const response = await fetch(`${ORCHESTRATOR_BASE}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error("TTS failed");
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function speechToText(audioBlob) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);

  try {
    const formData = new FormData();
    formData.append("file", audioBlob, getAudioFilename(audioBlob));
    const response = await fetch(`${ORCHESTRATOR_BASE}/voice-query`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("STT failed");
    const data = await response.json();
    return data.transcript || "";
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
