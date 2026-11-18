export function stripRicheLiveSuffix(title: string): string {
  return title.replace(/\s*[-–—]\s*live\s*$/i, "");
}
