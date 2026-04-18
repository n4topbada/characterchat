import type { Config } from "tailwindcss";

/**
 * The Scholastic Archive — "Modern Archivist" design system.
 * Source of truth: asset/scholastic_archive/DESIGN.md and asset/*\/code.html.
 *
 * Rules:
 *  - Prohibit 1px dividers for sectioning (use tonal shifts + whitespace).
 *  - Prohibit pills/R-full (max "full" = 12px radius).
 *  - Prohibit black / dark-grey text (use on-surface-variant #43474c).
 *  - No standard Material drop shadows; use tinted 6% primary shadows.
 *  - Dual-font: Space Grotesk (headline) + Manrope (body, weight 500).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces — tonal stacking hierarchy
        surface: {
          DEFAULT: "#f8f9ff",
          dim: "#ccdbf2",
          bright: "#f8f9ff",
          variant: "#d4e4fa",
          tint: "#3a5f94",
          container: {
            lowest: "#ffffff",
            low: "#eef4ff",
            DEFAULT: "#e5efff",
            high: "#dbe9ff",
            highest: "#d4e4fa",
          },
        },

        // Primary — muted archival blue
        primary: {
          DEFAULT: "#3a5f94",
          container: "#dbe6ff",
          fixed: "#d5e3ff",
          "fixed-dim": "#a7c8ff",
        },
        "on-primary": "#ffffff",
        "on-primary-container": "#43679d",
        "on-primary-fixed": "#001b3b",
        "on-primary-fixed-variant": "#1f477a",

        // Secondary — sage lime
        secondary: {
          DEFAULT: "#4c6457",
          container: "#cee9d9",
          fixed: "#cee9d9",
          "fixed-dim": "#b2cdbd",
        },
        "on-secondary": "#ffffff",
        "on-secondary-container": "#516a5d",
        "on-secondary-fixed": "#082016",
        "on-secondary-fixed-variant": "#344c40",

        // Tertiary — archival yellow (highlights only)
        tertiary: {
          DEFAULT: "#666018",
          container: "#f3e992",
          fixed: "#efe58f",
          "fixed-dim": "#d2c976",
        },
        "on-tertiary": "#ffffff",
        "on-tertiary-container": "#6f6820",
        "on-tertiary-fixed": "#1f1c00",
        "on-tertiary-fixed-variant": "#4e4800",

        // Foreground — never pure black
        "on-surface": "#0d1c2d",
        "on-surface-variant": "#43474c",
        "on-background": "#0d1c2d",
        background: "#f8f9ff",

        // Outline — use only at ~15% opacity ("ghost border")
        outline: "#73777c",
        "outline-variant": "#c3c7cc",

        // Inverse / Error
        "inverse-surface": "#233143",
        "inverse-on-surface": "#e9f1ff",
        "inverse-primary": "#a7c8ff",
        error: {
          DEFAULT: "#ba1a1a",
          container: "#ffdad6",
        },
        "on-error": "#ffffff",
        "on-error-container": "#93000a",
      },

      borderRadius: {
        DEFAULT: "0.125rem", // sm — chips, micro tags
        sm: "0.125rem",
        md: "0.375rem", // buttons
        lg: "0.5rem", // chat bubbles + primary cards
        xl: "0.75rem", // surface containers
        full: "0.75rem", // override "full" to 12px — pills forbidden
      },

      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
        headline: ["'Space Grotesk'", "system-ui", "sans-serif"],
        body: ["Manrope", "system-ui", "sans-serif"],
        label: ["Manrope", "system-ui", "sans-serif"],
        mono: ["'Space Mono'", "ui-monospace", "monospace"],
      },

      boxShadow: {
        tinted: "0 8px 16px rgba(58, 95, 148, 0.06)",
        "tinted-sm": "0 4px 8px rgba(58, 95, 148, 0.04)",
        "tinted-lg": "0 12px 24px rgba(58, 95, 148, 0.08)",
        cta: "0 8px 24px rgba(58, 95, 148, 0.22)",
      },

      backdropBlur: {
        glass: "28px",
        "glass-lg": "40px",
      },

      letterSpacing: {
        scholastic: "0.2em",
      },
    },
  },
  plugins: [],
};

export default config;
