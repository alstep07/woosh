import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: "#0A0F1E",
        "blue-primary": "#0EA5E9",
        "blue-secondary": "#06B6D4",
        "text-primary": "#F1F5F9",
        "text-secondary": "#64748B",
        card: "#111827",
        border: "#1E293B",
      },
      borderRadius: {
        card: "12px",
        input: "8px",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px 0 rgba(14,165,233,0.25)",
      },
    },
  },
  plugins: [],
};
export default config;
