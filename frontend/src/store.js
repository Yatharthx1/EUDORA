import { create } from "zustand";

export const useStore = create((set, get) => ({
  theme: "dark", // "dark" | "light"
  toggleTheme: () => set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),

  mode: "hands-on", // "hands-on" | "ai"
  setMode: (mode) => set({ mode }),

  origin: null, // { lat, lng, label }
  destination: null, // { lat, lng, label }
  setOrigin: (origin) => set({ origin }),
  setDestination: (destination) => set({ destination }),

  routes: null,
  activeRoute: "overall_best",
  setRoutes: (routes) => set({ routes }),
  setActiveRoute: (activeRoute) => set({ activeRoute }),

  isSearchExpanded: false,
  setSearchExpanded: (expanded) => set({ isSearchExpanded: expanded }),

  chatMessages: [
    {
      id: "init-1",
      role: "eudora",
      text: "I am EUDORA. Where would you like to go?",
    },
  ],
  addChatMessage: (message) =>
    set((state) => ({ chatMessages: [...state.chatMessages, message] })),

  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),

  isListening: false,
  setIsListening: (isListening) => set({ isListening }),

  // Navigation State
  isNavigating: false,
  navInstructions: [],
  currentNavStep: 0,
  userLocation: null,
  setIsNavigating: (isNavigating) => set({ isNavigating }),
  setNavInstructions: (navInstructions) => set({ navInstructions, currentNavStep: 0 }),
  setCurrentNavStep: (currentNavStep) => set({ currentNavStep }),
  setUserLocation: (userLocation) => set({ userLocation }),
  stopNavigation: () => set({ isNavigating: false, navInstructions: [], currentNavStep: 0, userLocation: null }),
}));
