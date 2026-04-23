import type { Config } from "tailwindcss";

// THEMED: Tailwind token configuration for light/dark SaaS UI.
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0EA5E9",
          dark: "#0284C7",
        },
        app: {
          sidebar: "#FFFFFF",
          "sidebar-dark": "#0F172A",
          content: "#F8FAFC",
          "content-dark": "#0F172A",
          card: "#FFFFFF",
          "card-dark": "#1E293B",
          border: "#E2E8F0",
          "border-dark": "#334155",
          muted: "#64748B",
          "muted-dark": "#94A3B8",
        },
        semantic: {
          success: "#10B981",
          warning: "#F59E0B",
          danger: "#EF4444",
        },
        // Brand
        brand: {
          50:  "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0EA5E9",
          600: "#0284C7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
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
        card: "0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.06)",
        "card-md": "0 8px 30px rgba(14,165,233,0.10)",
        "card-lg": "0 18px 55px rgba(15,23,42,0.16)",
      },
    },
  },
  plugins: [],
} satisfies Config;
