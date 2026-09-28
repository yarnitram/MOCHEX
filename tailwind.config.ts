import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        paper: "var(--paper)",
        panel: {
          DEFAULT: "var(--panel)",
          soft: "var(--panel-soft)",
        },
        "panel-soft": "var(--panel-soft)",
        line: {
          DEFAULT: "var(--line)",
          strong: "var(--line-strong)",
        },
        "line-strong": "var(--line-strong)",
        text: "var(--text)",
        muted: "var(--text-muted)",
        subtle: "var(--text-subtle)",
        gain: "var(--gain)",
        loss: "var(--loss)",
        warning: {
          DEFAULT: "var(--warning)",
          weak: "var(--warning-weak)",
        },
        "warning-weak": "var(--warning-weak)",
        info: {
          DEFAULT: "var(--info)",
          weak: "var(--info-weak)",
        },
        "info-weak": "var(--info-weak)",
        accent: {
          DEFAULT: "var(--accent)",
          soft: "var(--accent-soft)",
          contrast: "var(--accent-contrast)",
          weak: "var(--accent-weak)",
        },
        "accent-soft": "var(--accent-soft)",
        "accent-contrast": "var(--accent-contrast)",
        "accent-weak": "var(--accent-weak)",
        surface: {
          DEFAULT: "var(--panel)",
          soft: "var(--panel-soft)",
        },
        "surface-soft": "var(--panel-soft)",
        hairline: "var(--line)",
        foreground: "var(--text)",
        card: "var(--panel)",
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
        serif: ["var(--font-newsreader)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
