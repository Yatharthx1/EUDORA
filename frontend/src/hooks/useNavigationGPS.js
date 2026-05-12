import { useEffect } from "react";
import { useStore } from "../store";
import { calculateDistance, findClosestPointOnRoute } from "../utils/navigation";

export function useNavigationGPS() {
  const {
    isNavigating,
    navInstructions,
    routes,
    activeRoute,
    setUserLocation,
    currentNavStep,
    setCurrentNavStep,
  } = useStore();

  useEffect(() => {
    if (!isNavigating) return undefined;

    if (!("geolocation" in navigator)) {
      console.warn("Geolocation is not available in this browser.");
      return undefined;
    }

    const routeCoordinates = routes?.[activeRoute]?.route?.geometry?.coordinates;
    if (!routeCoordinates?.length) {
      setUserLocation(null);
      return undefined;
    }

    setUserLocation(null);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const rawLat = position.coords.latitude;
        const rawLng = position.coords.longitude;
        const snapped = findClosestPointOnRoute(rawLat, rawLng, routeCoordinates);

        setUserLocation({
          lat: snapped.lat,
          lng: snapped.lng,
          heading: snapped.heading,
          liveLat: rawLat,
          liveLng: rawLng,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          offRouteDistance: snapped.distanceMeters,
          source: "gps",
          timestamp: position.timestamp,
        });

        if (navInstructions?.length && currentNavStep < navInstructions.length - 1) {
          const nextInstruction = navInstructions[currentNavStep + 1];
          const distanceToInstruction = calculateDistance(
            snapped.lat,
            snapped.lng,
            nextInstruction.coordinate[0],
            nextInstruction.coordinate[1]
          );

          if (distanceToInstruction < 25) {
            setCurrentNavStep(currentNavStep + 1);
          }
        }
      },
      (error) => {
        console.warn("Navigation GPS watch failed:", error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [
    activeRoute,
    currentNavStep,
    isNavigating,
    navInstructions,
    routes,
    setCurrentNavStep,
    setUserLocation,
  ]);
}
