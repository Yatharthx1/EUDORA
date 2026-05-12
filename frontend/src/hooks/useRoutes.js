import { useEffect } from "react";
import { useStore } from "../store";
import { getRoutes, getSignals } from "../api";

export function useRoutes() {
  const { origin, destination, setRoutes, setIsLoading } = useStore();

  useEffect(() => {
    async function fetchRoutes() {
      if (origin?.lat && origin?.lng && destination?.lat && destination?.lng) {
        setIsLoading(true);
        try {
          const data = await getRoutes(origin.lat, origin.lng, destination.lat, destination.lng);
          if (data) {
            setRoutes(data);
          }
        } catch (error) {
          console.error(error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setRoutes(null);
      }
    }

    fetchRoutes();
  }, [origin, destination, setRoutes, setIsLoading]);
}
