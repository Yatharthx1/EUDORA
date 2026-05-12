import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store";
import { ROUTE_NAMES, ROUTE_COLORS } from "../config";
import { generateInstructions } from "../utils/navigation";
import { SkeletonRouteCards } from "./SkeletonRouteCards";
import "../styles/routes.css";

export function RouteCards() {
  const { routes, activeRoute, setActiveRoute, mode, isNavigating, setIsNavigating, setNavInstructions } = useStore();
  const isLoading = useStore((state) => state.isLoading);

  if (mode !== "hands-on" || isNavigating) return null;

  // Show skeleton cards while loading
  if (isLoading && !routes) {
    return (
      <AnimatePresence>
        <SkeletonRouteCards />
      </AnimatePresence>
    );
  }

  if (!routes) return null;

  const handleStartNav = (e, key, data) => {
    e.stopPropagation();
    setActiveRoute(key);
    if (data?.route?.geometry?.coordinates) {
      const instructions = generateInstructions(data.route.geometry.coordinates);
      setNavInstructions(instructions);
      setIsNavigating(true);
    }
  };

  const sortedEntries = Object.entries(routes).sort((a, b) => {
    if (a[0] === "overall_best") return 1;
    if (b[0] === "overall_best") return -1;
    return 0;
  });

  return (
    <div className="routes-panel">
      {sortedEntries.map(([key, data], index) => {
        if (!data) return null;
        const isActive = activeRoute === key;
        const color = ROUTE_COLORS[key] || "#fff";

        return (
          <motion.div
            key={key}
            className={`route-card glass-panel route-card-enter ${isActive ? "is-active" : ""}`}
            onClick={() => setActiveRoute(key)}
            initial={{ opacity: 0, y: 50, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: index * 0.1, type: "spring", damping: 22, stiffness: 180 }}
            whileHover={{ y: isActive ? -4 : -2 }}
          >
            <div className="route-stripe" style={{ backgroundColor: color }} />
            <div className="route-name" style={{ color: isActive ? color : "var(--ink)" }}>
              {ROUTE_NAMES[key]}
            </div>
            <div className="route-stats">
              <div className="stat-row">
                <span>Time</span>
                <span className="stat-val">{Math.round(data.time_min)} min</span>
              </div>
              <div className="stat-row">
                <span>Distance</span>
                <span className="stat-val">{data.distance_km.toFixed(1)} km</span>
              </div>
              <div className="stat-row">
                <span>Signals</span>
                <span className="stat-val">{data.signals}</span>
              </div>
              <div className="stat-row">
                <span>AQI</span>
                <span className="stat-val">{data.aqi_label || "N/A"}</span>
              </div>
            </div>
            
            {isActive && (
              <motion.button
                className="start-nav-btn"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                style={{ marginTop: 12 }}
                onClick={(e) => handleStartNav(e, key, data)}
              >
                Start Navigation
              </motion.button>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
