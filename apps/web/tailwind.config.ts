import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        priority: {
          high: "#dc2626",
          medium: "#d97706",
          routine: "#16a34a",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
