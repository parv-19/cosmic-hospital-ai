import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand
        brand: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        // Slate night (text)
        slateNight: "#0f172a",
        // Legacy aliases
        clinicBlue: "#4f46e5",
        healingMint: "#d1fae5",
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "Helvetica Neue", "sans-serif"],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)",
        "card-md": "0 4px 16px rgba(99,102,241,0.10)",
        "card-lg": "0 8px 24px rgba(99,102,241,0.14)",
      },
    },
  },
  plugins: [],
} satisfies Config;
