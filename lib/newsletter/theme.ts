// Email palette. Mirrors the dark theme tokens in `styles/_base.scss` because
// CSS variables do not exist in mail clients. Keep in sync when a venue colour
// changes on the site.

export const emailColors = {
  bg: "#0e0c0a",
  bg2: "#171512",
  ink: "#f6f6f6",
  muted: "#c3c3c3",
  line: "rgba(246, 246, 246, 0.2)",
  button: "#f6f6f6",
  buttonInk: "#0e0c0a",
} as const;

export const emailFonts = {
  serif: "Georgia, 'Times New Roman', Times, serif",
  sans: "Helvetica, Arial, sans-serif",
} as const;

/** Dark-theme venue colours, same values as `--dark-*` in `styles/_base.scss`. */
export const venueEmailColors: Record<string, string> = {
  debaser: "#d4573c",
  nalen: "#e0b25a",
  fallan: "#7ea4c9",
  slakthusen: "#e0b25a",
  kollektivetlivet: "#9a7bb8",
  sodrateatern: "#d98b4a",
  berns: "#5aa0c8",
  cirkus: "#c46b6b",
  kulturhuset: "#7ea4c9",
  hartwig: "#9a7bb8",
  annexet: "#7b8ec4",
  hovet: "#b57a9a",
  aviciiarena: "#6aa89a",
  trearena: "#d4a07a",
  strawberryarena: "#8c7ab8",
  konserthuset: "#a9784e",
  berwaldhallen: "#b08960",
  fasching: "#d4573c",
  stampen: "#6bb3a0",
  glennmillercafe: "#c47a8a",
  petsoundsbar: "#c46b6b",
  reimersholme: "#8ab07a",
  riche: "#c45c48",
  landet: "#c9a05a",
  encore: "#c49a72",
  bioaspen: "#6aa89a",
  scalateatern: "#d4a07a",
  gotalejon: "#8c7ab8",
  bagarmossen: "#6bb3a0",
  kmh: "#c47a8a",
  ericericsonhallen: "#9a7bb8",
  gronalund: "#d98b4a",
  fylkingen: "#6bb3a0",
  ronnells: "#c47a8a",
  larryscorner: "#7388a0",
};

export function venueColor(slug: string | undefined): string {
  return venueEmailColors[String(slug || "")] || emailColors.muted;
}
