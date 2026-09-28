import type { Config } from "tailwindcss";

function withAlpha(variableName: string) {
  return ({ opacityValue, opacityVariable }: { opacityValue?: string; opacityVariable?: string }) => {
    if (opacityValue !== undefined) {
      return `color-mix(in srgb, var(${variableName}) calc(${opacityValue} * 100%), transparent)`;
    }
    if (opacityVariable !== undefined) {
      return `color-mix(in srgb, var(${variableName}) calc(var(${opacityVariable}, 1) * 100%), transparent)`;
    }
    return `var(${variableName})`;
  };
}

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      borderColor: {
        DEFAULT: "var(--line)",
      },
      colors: {
        ink: withAlpha("--ink"),
        paper: withAlpha("--paper"),
        panel: {
          DEFAULT: withAlpha("--panel"),
          soft: withAlpha("--panel-soft"),
        },
        "panel-soft": withAlpha("--panel-soft"),
        line: {
          DEFAULT: withAlpha("--line"),
          strong: withAlpha("--line-strong"),
        },
        "line-strong": withAlpha("--line-strong"),
        text: withAlpha("--text"),
        muted: withAlpha("--text-muted"),
        subtle: withAlpha("--text-subtle"),
        gain: withAlpha("--gain"),
        loss: withAlpha("--loss"),
        warning: {
          DEFAULT: withAlpha("--warning"),
          weak: withAlpha("--warning-weak"),
        },
        "warning-weak": withAlpha("--warning-weak"),
        info: {
          DEFAULT: withAlpha("--info"),
          weak: withAlpha("--info-weak"),
        },
        "info-weak": withAlpha("--info-weak"),
        accent: {
          DEFAULT: withAlpha("--accent"),
          soft: withAlpha("--accent-soft"),
          contrast: withAlpha("--accent-contrast"),
          weak: withAlpha("--accent-weak"),
        },
        "accent-soft": withAlpha("--accent-soft"),
        "accent-contrast": withAlpha("--accent-contrast"),
        "accent-weak": withAlpha("--accent-weak"),
        surface: {
          DEFAULT: withAlpha("--panel"),
          soft: withAlpha("--panel-soft"),
        },
        "surface-soft": withAlpha("--panel-soft"),
        hairline: withAlpha("--line"),
        foreground: withAlpha("--text"),
        card: withAlpha("--panel"),
      } as unknown as Record<string, string>,
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
