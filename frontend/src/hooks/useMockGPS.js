import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { calculateBearing, calculateDistance } from "../utils/navigation";

export function useMockGPS() {
  const { isNavigating, navInstructions, routes, activeRoute, setUserLocation, currentNavStep, setCurrentNavStep } = useStore();
  const coordIndexRef = useRef(0);
  const positionRef = useRef(null);

  useEffect(() => {
    if (!isNavigating || !navInstructions || navInstructions.length === 0) {
      coordIndexRef.current = 0;
      positionRef.current = null;
      return;
    }

    coordIndexRef.current = 0;
    
    const coords = routes[activeRoute].route.geometry.coordinates; // [[lng, lat]]

    const interval = setInterval(() => {
      if (coordIndexRef.current >= coords.length - 1) {
        clearInterval(interval);
        return;
      }

      // GeoJSON is [lng, lat], we need [lat, lng]
      const currentPoint = [coords[coordIndexRef.current][1], coords[coordIndexRef.current][0]];
      const nextPoint = [coords[coordIndexRef.current + 1][1], coords[coordIndexRef.current + 1][0]];

      if (!positionRef.current) {
        positionRef.current = { ...currentPoint };
      }

      const speed = 15; // meters per second
      const distToNext = calculateDistance(
        positionRef.current[0], positionRef.current[1],
        nextPoint[0], nextPoint[1]
      );

      const bearing = calculateBearing(
        positionRef.current[0], positionRef.current[1],
        nextPoint[0], nextPoint[1]
      );

      if (distToNext < speed) {
        positionRef.current = { ...nextPoint };
        coordIndexRef.current += 1;
      } else {
        const ratio = speed / distToNext;
        positionRef.current[0] += (nextPoint[0] - positionRef.current[0]) * ratio;
        positionRef.current[1] += (nextPoint[1] - positionRef.current[1]) * ratio;
      }

      setUserLocation({
        lat: positionRef.current[0],
        lng: positionRef.current[1],
        heading: bearing
      });

      // Update current instruction step if close
      if (currentNavStep < navInstructions.length - 1) {
        const nextInst = navInstructions[currentNavStep + 1];
        const distToInst = calculateDistance(
          positionRef.current[0], positionRef.current[1],
          nextInst.coordinate[0], nextInst.coordinate[1]
        );
        if (distToInst < 20) {
          setCurrentNavStep(currentNavStep + 1);
        }
      }

    }, 1000);

    return () => clearInterval(interval);
  }, [isNavigating, navInstructions, routes, activeRoute, currentNavStep, setCurrentNavStep, setUserLocation]);
}
