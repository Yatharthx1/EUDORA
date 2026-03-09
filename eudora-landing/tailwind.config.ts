import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: "#1c1a17",
        cream: "#f0ebe3",
        muted: "#9e9890",
        amber: "#e8a845",
        teal: "#3ecfcf",
        violet: "#9b7fe8",
        red: "#e05555",
        "footer-bg": "#111008",
      },
    },
  },
  plugins: [],
};

export default config;
