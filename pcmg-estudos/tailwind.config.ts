import type { Config } from "tailwindcss";

const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"),
        surface: c("surface"),
        "surface-2": c("surface-2"),
        border: c("border"),
        fg: c("fg"),
        muted: c("muted"),
        primary: { DEFAULT: c("primary"), fg: c("primary-fg"), deep: c("primary-deep"), soft: c("primary-soft") },
        alert: { DEFAULT: c("alert"), soft: c("alert-soft") },
        warn: { DEFAULT: c("warn"), soft: c("warn-soft") },
        ring: c("ring"),
      },
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "\"SF Pro Text\"", "\"Segoe UI\"", "Roboto", "Inter",
          "\"Helvetica Neue\"", "Arial", "sans-serif",
        ],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem" },
      boxShadow: {
        card: "0 1px 2px rgb(16 24 16 / 0.04), 0 1px 1px rgb(16 24 16 / 0.02)",
        pop: "0 12px 32px -8px rgb(16 24 16 / 0.18), 0 2px 6px rgb(16 24 16 / 0.06)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        "scale-in": { from: { opacity: "0", transform: "scale(.97)" }, to: { opacity: "1", transform: "none" } },
        "slide-up": { from: { transform: "translateY(100%)" }, to: { transform: "none" } },
        shimmer: { "0%": { opacity: "0.55" }, "50%": { opacity: "1" }, "100%": { opacity: "0.55" } },
      },
      animation: {
        "fade-in": "fade-in .22s ease-out both",
        "scale-in": "scale-in .18s ease-out both",
        "slide-up": "slide-up .24s cubic-bezier(.2,.8,.2,1) both",
        shimmer: "shimmer 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
