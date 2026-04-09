import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        slateNight: "#0f172a",
        clinicBlue: "#1d4ed8",
        healingMint: "#d1fae5"
      }
    }
  },
  plugins: []
} satisfies Config;

