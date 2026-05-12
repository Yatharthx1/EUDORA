import { motion } from "framer-motion";
import { useStore } from "../store";
import { formatDistance } from "../utils/navigation";
import "../styles/navigation.css";

const getIcon = (type) => {
  if (type === "turn_left") return "↰";
  if (type === "turn_right") return "↱";
  if (type === "destination") return "📍";
  return "↑";
};

export function NavHeader() {
  const { navInstructions, currentNavStep, stopNavigation, routes, activeRoute } = useStore();

  if (!navInstructions || navInstructions.length === 0) return null;

  const currentStep = navInstructions[currentNavStep] || navInstructions[navInstructions.length - 1];

  const remainingDistance = navInstructions
    .slice(currentNavStep)
    .reduce((acc, step) => acc + step.distance, 0);

  const activeRouteData = routes && routes[activeRoute];
  const aqiLabel = activeRouteData?.aqi_label || "N/A";

  return (
    <motion.div
      className="nav-header glass-panel"
      initial={{ opacity: 0, y: -50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
    >
      <div className="nav-header-left">
        <div className="nav-direction-icon">
          {getIcon(currentStep.type)}
        </div>
        <div className="nav-info">
          <div className="nav-instruction">
            {currentStep.instruction}{currentStep.type !== 'destination' ? ' next' : ''}
          </div>
          <div className="nav-distance" style={{ display: 'flex', gap: '8px' }}>
            <span>AQI: {aqiLabel}</span>
            <span>•</span>
            <span>{formatDistance(remainingDistance)} left</span>
          </div>
        </div>
      </div>
      <button className="nav-stop-btn" onClick={stopNavigation}>
        Stop
      </button>
    </motion.div>
  );
}
