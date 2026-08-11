import type { PaperColor } from "./note-runtime-adapter";

export type FirstAidTheme = {
  paper: string;
  ink: string;
  primary: string;
  secondary: string;
  bandPrimary: string;
  bandSecondary: string;
  titleInk: string;
  heading: string;
  headingInk: string;
  block: string;
  pearl: string;
  pearlInk: string;
};

export const FIRST_AID_THEMES: Record<PaperColor, FirstAidTheme> = {
  white: {
    paper: "#ffffff", ink: "#26343a", primary: "#1b7184", secondary: "#8b2c58",
    bandPrimary: "#16758a", bandSecondary: "#8b2c58", titleInk: "#ffffff",
    heading: "#1b7184", headingInk: "#ffffff", block: "#ffffff", pearl: "#fff3b4", pearlInk: "#3b3111",
  },
  ivory: {
    paper: "#fffaf0", ink: "#3b3328", primary: "#356b68", secondary: "#8a523c",
    bandPrimary: "#356b68", bandSecondary: "#8a523c", titleInk: "#ffffff",
    heading: "#356b68", headingInk: "#ffffff", block: "#fffdf7", pearl: "#f8e8a7", pearlInk: "#443612",
  },
  yellow: {
    paper: "#fff8cf", ink: "#3d3520", primary: "#5d6c32", secondary: "#8f4d2c",
    bandPrimary: "#5d6c32", bandSecondary: "#8f4d2c", titleInk: "#ffffff",
    heading: "#5d6c32", headingInk: "#ffffff", block: "#fffade", pearl: "#efd479", pearlInk: "#3d310c",
  },
  mint: {
    paper: "#eefaf3", ink: "#203b32", primary: "#176d5c", secondary: "#80516a",
    bandPrimary: "#176d5c", bandSecondary: "#80516a", titleInk: "#ffffff",
    heading: "#176d5c", headingInk: "#ffffff", block: "#f7fcf9", pearl: "#f6e9a6", pearlInk: "#40370f",
  },
  blue: {
    paper: "#eef7fc", ink: "#203845", primary: "#246b87", secondary: "#6f527b",
    bandPrimary: "#246b87", bandSecondary: "#6f527b", titleInk: "#ffffff",
    heading: "#246b87", headingInk: "#ffffff", block: "#f7fbfd", pearl: "#f6e6a5", pearlInk: "#42380f",
  },
  dark: {
    paper: "#263139", ink: "#edf3f4", primary: "#79cfca", secondary: "#f0a1bf",
    bandPrimary: "#2f7481", bandSecondary: "#8e3f65", titleInk: "#ffffff",
    heading: "#2d6e7a", headingInk: "#ffffff", block: "#2c3a42", pearl: "#50451e", pearlInk: "#fff2b2",
  },
};

export function firstAidThemeVariables(color: PaperColor): Record<`--fa-${string}`, string> {
  const theme = FIRST_AID_THEMES[color] ?? FIRST_AID_THEMES.white;
  return {
    "--fa-paper-bg": theme.paper,
    "--fa-ink": theme.ink,
    "--fa-primary": theme.primary,
    "--fa-secondary": theme.secondary,
    "--fa-band-primary": theme.bandPrimary,
    "--fa-band-secondary": theme.bandSecondary,
    "--fa-title-ink": theme.titleInk,
    "--fa-heading-bg": theme.heading,
    "--fa-heading-ink": theme.headingInk,
    "--fa-block-bg": theme.block,
    "--fa-pearl-bg": theme.pearl,
    "--fa-pearl-ink": theme.pearlInk,
    "--fa-label-bg": "color-mix(in srgb,var(--fa-primary) 9%,var(--fa-block-bg))",
    "--fa-table-head-bg": "color-mix(in srgb,var(--fa-primary) 11%,var(--fa-block-bg))",
    "--fa-border": "color-mix(in srgb,var(--fa-primary) 27%,var(--fa-block-bg))",
    "--fa-soft-border": "color-mix(in srgb,var(--fa-primary) 17%,var(--fa-block-bg))",
    "--fa-muted-bg": "color-mix(in srgb,var(--fa-primary) 7%,var(--fa-block-bg))",
    "--fa-muted-ink": "color-mix(in srgb,var(--fa-ink) 67%,var(--fa-primary))",
    "--fa-caption-bg": "color-mix(in srgb,var(--fa-primary) 9%,var(--fa-block-bg))",
    "--fa-caption-ink": "color-mix(in srgb,var(--fa-ink) 82%,var(--fa-primary))",
    "--fa-flow-step-bg": "color-mix(in srgb,var(--fa-block-bg) 94%,var(--fa-paper-bg))",
    "--fa-pearl-border": "color-mix(in srgb,var(--fa-secondary) 30%,var(--fa-pearl-bg))",
    "--fa-toolbar-bg": "color-mix(in srgb,var(--fa-block-bg) 96%,var(--fa-primary))",
    "--fa-toolbar-ink": "color-mix(in srgb,var(--fa-ink) 84%,var(--fa-primary))",
    "--fa-focus-bg": "color-mix(in srgb,var(--fa-primary) 12%,var(--fa-block-bg))",
  };
}

export function firstAidThemeInlineStyle(color: PaperColor) {
  return Object.entries(firstAidThemeVariables(color)).map(([property, value]) => `${property}:${value}`).join(";");
}
