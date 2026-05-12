import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Navigation, ArrowDownUp } from "lucide-react";
import { useStore } from "../store";
import { useGeocodeSearch } from "../hooks/useGeocodeSearch";
import { reverseGeocode } from "../api";
import "../styles/search.css";

export function SearchBar() {
  const { mode, isSearchExpanded, setSearchExpanded, origin, destination, setOrigin, setDestination } = useStore();
  const [activeInput, setActiveInput] = useState(null);
  const [query, setQuery] = useState("");
  const { results, isSearching } = useGeocodeSearch(query);
  const containerRef = useRef(null);
  const gpsAttempted = useRef(false);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setSearchExpanded(false);
        setActiveInput(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [setSearchExpanded]);

  // Auto-detect user location as origin when search bar first expands
  useEffect(() => {
    if (isSearchExpanded && !origin && !gpsAttempted.current) {
      gpsAttempted.current = true;
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          const { latitude, longitude } = pos.coords;
          try {
            const res = await reverseGeocode(latitude, longitude);
            const label = res?.address?.road || res?.address?.suburb || "My Location";
            setOrigin({ lat: latitude, lng: longitude, label });
          } catch {
            setOrigin({ lat: latitude, lng: longitude, label: "My Location" });
          }
        }, () => {
          // GPS denied - do nothing
        }, { timeout: 5000 });
      }
    }
  }, [isSearchExpanded, origin, setOrigin]);

  const handleSelect = (result) => {
    const data = { lat: parseFloat(result.lat), lng: parseFloat(result.lon), label: result.display_name.split(",")[0] };
    if (activeInput === "origin") setOrigin(data);
    if (activeInput === "destination") setDestination(data);

    if (activeInput === "origin" && !destination) {
      setActiveInput("destination");
      setQuery("");
    } else {
      setSearchExpanded(false);
      setActiveInput(null);
    }
  };

  const handleGPS = async (e) => {
    e.stopPropagation();
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await reverseGeocode(latitude, longitude);
          const label = res?.address?.road || res?.address?.suburb || "My Location";
          setOrigin({ lat: latitude, lng: longitude, label });
        } catch {
          setOrigin({ lat: latitude, lng: longitude, label: "My Location" });
        }
      });
    }
  };

  const handleSwap = (e) => {
    e.stopPropagation();
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  if (mode === "ai") return null;

  return (
    <motion.div
      ref={containerRef}
      layout
      className={`search-container glass-panel ${mode !== "hands-on" ? "is-hidden" : ""}`}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
    >
      <AnimatePresence mode="popLayout">
        {!isSearchExpanded ? (
          <motion.div
            key="collapsed"
            className="search-header"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setSearchExpanded(true);
              setActiveInput("destination");
              setQuery("");
            }}
          >
            <div className="brand-lockup">
              <div className="brand-word">EUDORA</div>
            </div>
            <div className="search-input-wrap">
              <Search size={18} className="search-input-icon" />
              <input
                readOnly
                className="search-input"
                placeholder={origin && destination ? `${origin.label} -> ${destination.label}` : "Where to?"}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            className="waypoints-form"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="waypoints-rows">
              <div className="waypoint-row">
                <div className="waypoint-glyph is-a">A</div>
                <input
                  autoFocus={activeInput === "origin"}
                  className="waypoint-input"
                  placeholder="Starting point..."
                  value={activeInput === "origin" ? query : origin?.label || ""}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (origin) setOrigin(null);
                  }}
                  onFocus={() => { setActiveInput("origin"); setQuery(origin ? "" : query); }}
                />
                <button className="waypoint-action-btn" onClick={handleGPS} title="Use GPS">
                  <Navigation size={14} />
                </button>
              </div>

              <div className="waypoint-row">
                <div className="waypoint-glyph is-b">B</div>
                <input
                  autoFocus={activeInput === "destination"}
                  className="waypoint-input"
                  placeholder="Destination..."
                  value={activeInput === "destination" ? query : destination?.label || ""}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (destination) setDestination(null);
                  }}
                  onFocus={() => { setActiveInput("destination"); setQuery(destination ? "" : query); }}
                />
              </div>

              {/* Swap button - sits between the rows */}
              <button className="swap-btn" onClick={handleSwap} title="Swap">
                <ArrowDownUp size={14} />
              </button>
            </div>

            {/* Autocomplete Dropdown — staggered fade-in */}
            {activeInput && Array.isArray(results) && results.length > 0 && (
              <div className="autocomplete-dropdown">
                {results.map((r, idx) => (
                  <div
                    key={idx}
                    className="autocomplete-item autocomplete-item-animated"
                    style={{ animationDelay: `${idx * 60}ms` }}
                    onClick={() => handleSelect(r)}
                  >
                    <div className="autocomplete-name">{r.display_name.split(",")[0]}</div>
                    <div className="autocomplete-address">{r.display_name.split(",").slice(1).join(",").trim()}</div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
