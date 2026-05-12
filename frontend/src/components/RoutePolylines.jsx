import { useState, useRef, useEffect } from "react";
import { Polyline } from "react-leaflet";
import { useStore } from "../store";
import { ROUTE_COLORS } from "../config";
import { AnimatedPolyline } from "./AnimatedPolyline";

export function RoutePolylines() {
  const routes = useStore((state) => state.routes);
  const activeRoute = useStore((state) => state.activeRoute);
  const isNavigating = useStore((state) => state.isNavigating);

  // Track which route keys have already been animated so we don't re-trace
  const [animatedKeys, setAnimatedKeys] = useState(new Set());
  const prevRoutesRef = useRef(null);

  // Reset animated keys when routes change (new search)
  useEffect(() => {
    if (routes !== prevRoutesRef.current) {
      setAnimatedKeys(new Set());
      prevRoutesRef.current = routes;
    }
  }, [routes]);

  if (!routes) return null;

  const handleAnimationComplete = (key) => {
    setAnimatedKeys((prev) => new Set(prev).add(key));
  };

  return (
    <>
      {Object.entries(routes).map(([key, routeData]) => {
        if (key !== activeRoute) return null;
        if (!routeData?.route?.geometry?.coordinates) return null;

        const color = ROUTE_COLORS[key] || "#ffffff";
        const positions = routeData.route.geometry.coordinates.map((c) => [c[1], c[0]]);
        const alreadyAnimated = animatedKeys.has(key);

        // During navigation or after initial animation: show static polyline
        if (isNavigating || alreadyAnimated) {
          return (
            <div key={`${key}-static`}>
              {/* Shadow Polyline */}
              <Polyline
                positions={positions}
                pathOptions={{
                  color,
                  weight: 12,
                  opacity: 0.3,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
              {/* Main Polyline */}
              <Polyline
                positions={positions}
                pathOptions={{
                  color,
                  weight: 4,
                  opacity: 1,
                  lineCap: "round",
                  lineJoin: "round",
                }}
                className={!isNavigating ? "route-polyline-animated" : ""}
              />
            </div>
          );
        }

        // First time seeing this route: animate it tracing in
        return (
          <AnimatedPolyline
            key={`${key}-animated`}
            positions={positions}
            color={color}
            weight={4}
            opacity={1}
            shadowWeight={12}
            shadowOpacity={0.3}
            duration={1400}
            onComplete={() => handleAnimationComplete(key)}
            className="route-polyline-animated"
          />
        );
      })}
    </>
  );
}
