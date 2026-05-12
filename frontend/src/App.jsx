import { useEffect } from "react";
import { AppShell } from "./components/AppShell";
import { MapLayer } from "./components/MapLayer";
import { MapGrade } from "./components/MapGrade";
import { SearchBar } from "./components/SearchBar";
import { RouteCards } from "./components/RouteCards";
import { AIPanel } from "./components/AIPanel";
import { ModeToggle } from "./components/ModeToggle";
import { NavHeader } from "./components/NavHeader";
import { ProgressBar } from "./components/ProgressBar";
import { useRoutes } from "./hooks/useRoutes";
import { useStore } from "./store";
import "./styles/design-system.css";
import "./styles/animations.css";

export default function App() {
  const isNavigating = useStore((state) => state.isNavigating);
  const theme = useStore((state) => state.theme);

  // Sync theme attribute to root element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Trigger route fetching when origin/destination change
  useRoutes();

  return (
    <AppShell>
      <ProgressBar />
      <MapGrade />
      <MapLayer />
      {isNavigating ? (
        <NavHeader />
      ) : (
        <>
          <SearchBar />
          <RouteCards />
          <AIPanel />
          <ModeToggle />
        </>
      )}
    </AppShell>
  );
}
