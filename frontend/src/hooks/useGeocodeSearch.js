import { useState, useEffect } from "react";
import { geocodeSearch } from "../api";

export function useGeocodeSearch(query) {
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const handler = setTimeout(async () => {
      const data = await geocodeSearch(query);
      setResults(data || []);
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(handler);
  }, [query]);

  return { results, isSearching, clear: () => setResults([]) };
}
