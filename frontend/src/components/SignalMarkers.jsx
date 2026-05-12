import { CircleMarker } from "react-leaflet";
import { useStore } from "../store";

export function SignalMarkers() {
  const routes = useStore((state) => state.routes);
  const activeRoute = useStore((state) => state.activeRoute);

  if (!routes || !routes[activeRoute]?.signal_coords) return null;

  const signals = routes[activeRoute].signal_coords;

  return (
    <>
      {signals.map((signal, index) => (
        <CircleMarker
          key={`signal-${index}`}
          center={[signal.lat, signal.lng]}
          pathOptions={{
            color: "#ff4444",
            fillColor: "#ff4444",
            fillOpacity: 1,
            weight: 2,
          }}
          radius={4}
          className="signal-marker"
        />
      ))}
    </>
  );
}
