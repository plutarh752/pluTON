import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Scan Diff semantic colors (Screen 3)
        diff: {
          new: "#16a34a", // зелёный — новые лоты
          gone: "#6b7280", // серый — исчезнувшие
          cheaper: "#eab308", // жёлтый — подешевевшие
          pricier: "#dc2626", // красный — подорожавшие
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
