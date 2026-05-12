import { useEffect, useRef, useMemo } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents, Marker } from "react-leaflet";
import L from "leaflet";
import { useStore } from "../store";
import { API_BASE, INDORE_CENTER, DEFAULT_ZOOM } from "../config";
import { RoutePolylines } from "./RoutePolylines";
import { SignalMarkers } from "./SignalMarkers";
import { useMockGPS } from "../hooks/useMockGPS";
import "../styles/map.css";

const navMarkerIcon = new L.DivIcon({
  className: "nav-marker-container",
  html: `
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.6)); transition: transform 1s ease-out;">
      <path d="M12 2L4 20L12 16L20 20L12 2Z" fill="white" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>
    </svg>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const originPinIcon = new L.DivIcon({
  className: "endpoint-pin",
  html: `
    <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5));">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#ffffff"/>
      <circle cx="14" cy="14" r="6" fill="#060709"/>
    </svg>
  `,
  iconSize: [28, 36],
  iconAnchor: [14, 36],
});

const destPinIcon = new L.DivIcon({
  className: "endpoint-pin",
  html: `
    <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5));">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#7c6aff"/>
      <circle cx="14" cy="14" r="6" fill="#ffffff"/>
    </svg>
  `,
  iconSize: [28, 36],
  iconAnchor: [14, 36],
});

function NavigationController() {
  const map = useMap();
  const { isNavigating, userLocation } = useStore();
  const originalView = useRef({ center: INDORE_CENTER, zoom: DEFAULT_ZOOM });

  // Start/Stop Navigation
  useEffect(() => {
    if (isNavigating) {
      originalView.current = { center: map.getCenter(), zoom: map.getZoom() };
      map.setZoom(18, { animate: true });
    } else {
      map.setView(originalView.current.center, originalView.current.zoom, { animate: true });
      map.getContainer().style.transform = `rotate(0deg) scale(1)`;
    }
  }, [isNavigating, map]);

  // Track User Location & Rotate
  useEffect(() => {
    if (isNavigating && userLocation) {
      map.panTo([userLocation.lat, userLocation.lng], { animate: true, duration: 1 });
      
      if (userLocation.heading !== undefined) {
        const rotation = 360 - userLocation.heading;
        map.getContainer().style.transform = `rotate(${rotation}deg) scale(1.5)`;
        map.getContainer().style.transition = `transform 1s ease-out`;

        // Counter-rotate the marker so it points in the heading direction visually pointing UP
        const markerEl = document.querySelector('.nav-marker-container svg');
        if (markerEl) {
           markerEl.style.transform = `rotate(${userLocation.heading}deg)`;
        }
      }
    }
  }, [isNavigating, userLocation, map]);

  return null;
}

/**
 * Fits the map bounds to the active route polyline when routes arrive.
 * Uses generous padding so the full path is visible even with UI overlays.
 */
function RouteFitter() {
  const map = useMap();
  const routes = useStore((state) => state.routes);
  const activeRoute = useStore((state) => state.activeRoute);
  const isNavigating = useStore((state) => state.isNavigating);

  useEffect(() => {
    if (isNavigating) return;
    if (!routes || !routes[activeRoute]?.route?.geometry?.coordinates) return;

    const coords = routes[activeRoute].route.geometry.coordinates;
    if (coords.length === 0) return;

    const leafletBounds = coords.map((c) => [c[1], c[0]]); // GeoJSON [lng,lat] → Leaflet [lat,lng]

    map.fitBounds(leafletBounds, {
      padding: [60, 60],
      animate: true,
      duration: 0.8,
      maxZoom: 16,
    });
  }, [routes, activeRoute, isNavigating, map]);

  return null;
}

/** Clicking the map in AI mode switches back to hands-on mode. */
function MapClickToHandsOn() {
  const mode = useStore((state) => state.mode);
  const setMode = useStore((state) => state.setMode);
  useMapEvents({
    click: () => {
      if (mode === "ai") setMode("hands-on");
    },
  });
  return null;
}

export function MapLayer() {
  const mode = useStore((state) => state.mode);
  const theme = useStore((state) => state.theme);
  const userLocation = useStore((state) => state.userLocation);
  const isNavigating = useStore((state) => state.isNavigating);
  const origin = useStore((state) => state.origin);
  const destination = useStore((state) => state.destination);
  const routes = useStore((state) => state.routes);
  const activeRoute = useStore((state) => state.activeRoute);
  const setMode = useStore((state) => state.setMode);
  
  useMockGPS();

  function MapResizer() {
    const map = useMap();
    useEffect(() => {
      const timer = setTimeout(() => map.invalidateSize(), 100);
      return () => clearTimeout(timer);
    }, [map]);
    return null;
  }

  const tileStyle = theme === "dark" ? "dataviz-dark" : "dataviz";
  const cartoFallback = theme === "dark"
    ? "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
    : "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";

  const showEndpointPins = routes && !isNavigating;

  // Derive endpoint positions from the active route's actual polyline
  // so the markers sit exactly on the route terminus, not the geocoded point.
  const endpointPositions = useMemo(() => {
    const coords = routes?.[activeRoute]?.route?.geometry?.coordinates;
    if (!coords || coords.length === 0) return null;

    const first = coords[0];           // [lng, lat]
    const last  = coords[coords.length - 1]; // [lng, lat]
    return {
      origin:      [first[1], first[0]],  // Leaflet [lat, lng]
      destination: [last[1],  last[0]],
    };
  }, [routes, activeRoute]);

  // Fallback to geocoded coordinates when no route exists yet
  const originPos = endpointPositions?.origin
    ?? (origin ? [origin.lat, origin.lng] : null);
  const destPos = endpointPositions?.destination
    ?? (destination ? [destination.lat, destination.lng] : null);

  // Only blur the map in AI mode when NOT navigating
  const shouldBlur = mode === "ai" && !isNavigating;

  return (
    <div className={`map-wrapper ${shouldBlur ? "is-blurred" : ""}`} style={{ overflow: "hidden" }}>
      <MapContainer
        center={INDORE_CENTER}
        zoom={DEFAULT_ZOOM}
        zoomControl={false}
        className="map-container"
      >
        <MapResizer />
        <NavigationController />
        <RouteFitter />
        <MapClickToHandsOn />
        {/* Primary: MapTiler (switches style by theme) */}
        <TileLayer
          key={tileStyle}
          url={`${API_BASE}/api/tiles/${tileStyle}/{z}/{x}/{y}.png`}
          attribution='&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          errorTileUrl={cartoFallback}
          maxZoom={20}
          tileSize={512}
          zoomOffset={-1}
        />
        <RoutePolylines />
        <SignalMarkers />

        {/* Origin & Destination pins — use route-snapped positions */}
        {showEndpointPins && originPos && (
          <Marker position={originPos} icon={originPinIcon} />
        )}
        {showEndpointPins && destPos && (
          <Marker position={destPos} icon={destPinIcon} />
        )}
        
        {/* Navigation marker */}
        {isNavigating && userLocation && (
          <Marker 
            position={[userLocation.lat, userLocation.lng]} 
            icon={navMarkerIcon} 
          />
        )}
      </MapContainer>
    </div>
  );
}
