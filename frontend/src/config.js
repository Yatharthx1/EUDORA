const hostname = typeof window !== "undefined" ? window.location.hostname : "";
const isDevelopmentHost =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "::1";

const LOCAL_API_BASE = import.meta.env.VITE_LOCAL_API_BASE ?? "http://127.0.0.1:8080";
const HF_API_BASE = import.meta.env.VITE_HF_API_BASE ?? "https://theyath-eudora.hf.space";

export const API_BASE =
  import.meta.env.VITE_API_BASE ?? (isDevelopmentHost ? LOCAL_API_BASE : HF_API_BASE);

export const ORCHESTRATOR_BASE =
  import.meta.env.VITE_ORCHESTRATOR_BASE ??
  (isDevelopmentHost ? "http://127.0.0.1:8081" : `${HF_API_BASE}/orchestrator`);

export const INDORE_CENTER = [22.7196, 75.8577];
export const DEFAULT_ZOOM = 13;

export const ROUTE_COLORS = {
  fastest: "#60a5fa", // cool blue
  least_signal: "#f59e0b", // amber
  least_pollution: "#34d399", // emerald
  overall_best: "#a78bfa", // violet
  greenest: "#22c55e", // green
};

export const ROUTE_NAMES = {
  fastest: "Fastest",
  least_signal: "Least Signals",
  least_pollution: "Least Pollution",
  overall_best: "Overall Best",
  greenest: "Greenest",
};

export const SPRING_CONFIG = { type: "spring", damping: 28, stiffness: 180 };
export const TRANSITION_SLOW = { duration: 0.5, ease: [0.16, 1, 0.3, 1] };
