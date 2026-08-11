import type { PaperColor } from "./note-runtime-adapter";
import "./first-aid-signature-polish.css";

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
    paper: "#ffffff", ink: "#22343b", primary: "#146f7d", secondary: "#96365e",
    bandPrimary: "#126f7e", bandSecondary: "#96365e", titleInk: "#ffffff",
    heading: "#176f7c", headingInk: "#ffffff", block: "#ffffff", pearl: "#fff0a6", pearlInk: "#3b3111",
  },
  ivory: {
    paper: "#fff8e9", ink: "#3b3329", primary: "#356c62", secondary: "#a15b42",
    bandPrimary: "#356c62", bandSecondary: "#a15b42", titleInk: "#ffffff",
    heading: "#356c62", headingInk: "#ffffff", block: "#fffdf6", pearl: "#f7df8b", pearlInk: "#443612",
  },
  yellow: {
    paper: "#fff4bd", ink: "#3d3520", primary: "#66712f", secondary: "#a4542f",
    bandPrimary: "#66712f", bandSecondary: "#a4542f", titleInk: "#ffffff",
    heading: "#66712f", headingInk: "#ffffff", block: "#fff9d7", pearl: "#ebca58", pearlInk: "#3b300a",
  },
  mint: {
    paper: "#e9f8ef", ink: "#203a31", primary: "#126d59", secondary: "#87516e",
    bandPrimary: "#126d59", bandSecondary: "#87516e", titleInk: "#ffffff",
    heading: "#126d59", headingInk: "#ffffff", block: "#f6fcf8", pearl: "#f3df86", pearlInk: "#40370f",
  },
  blue: {
    paper: "#eaf5fb", ink: "#203845", primary: "#236f91", secondary: "#735582",
    bandPrimary: "#236f91", bandSecondary: "#735582", titleInk: "#ffffff",
    heading: "#236f91", headingInk: "#ffffff", block: "#f6fbfe", pearl: "#f2df83", pearlInk: "#42380f",
  },
  dark: {
    paper: "#253139", ink: "#eef4f5", primary: "#75d0c8", secondary: "#f0a1bf",
    bandPrimary: "#286f7c", bandSecondary: "#8d3e64", titleInk: "#ffffff",
    heading: "#2a707c", headingInk: "#ffffff", block: "#2d3b43", pearl: "#57491c", pearlInk: "#fff2b2",
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
    "--fa-label-bg": "color-mix(in srgb,var(--fa-primary) 18%,var(--fa-block-bg))",
    "--fa-label-ink": "color-mix(in srgb,var(--fa-primary) 86%,var(--fa-ink))",
    "--fa-table-head-bg": "color-mix(in srgb,var(--fa-primary) 22%,var(--fa-block-bg))",
    "--fa-table-head-ink": "color-mix(in srgb,var(--fa-primary) 82%,var(--fa-ink))",
    "--fa-border": "color-mix(in srgb,var(--fa-primary) 34%,var(--fa-block-bg))",
    "--fa-soft-border": "color-mix(in srgb,var(--fa-primary) 22%,var(--fa-block-bg))",
    "--fa-muted-bg": "color-mix(in srgb,var(--fa-primary) 11%,var(--fa-block-bg))",
    "--fa-muted-ink": "color-mix(in srgb,var(--fa-ink) 70%,var(--fa-primary))",
    "--fa-caption-bg": "color-mix(in srgb,var(--fa-secondary) 12%,var(--fa-block-bg))",
    "--fa-caption-ink": "color-mix(in srgb,var(--fa-ink) 84%,var(--fa-secondary))",
    "--fa-flow-step-bg": "color-mix(in srgb,var(--fa-primary) 8%,var(--fa-block-bg))",
    "--fa-pearl-border": "color-mix(in srgb,var(--fa-secondary) 40%,var(--fa-pearl-bg))",
    "--fa-toolbar-bg": "color-mix(in srgb,var(--fa-block-bg) 92%,var(--fa-primary))",
    "--fa-toolbar-ink": "color-mix(in srgb,var(--fa-ink) 82%,var(--fa-primary))",
    "--fa-focus-bg": "color-mix(in srgb,var(--fa-primary) 16%,var(--fa-block-bg))",
  };
}

export function firstAidThemeInlineStyle(color: PaperColor) {
  return Object.entries(firstAidThemeVariables(color)).map(([property, value]) => `${property}:${value}`).join(";");
}
