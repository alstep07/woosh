/** Generate readable alternatives when the preferred slug is taken. */
export function suggestSlugs(base: string): string[] {
  const trimmed = base.slice(0, 28); // leave room for suffix
  return [
    `${trimmed}1`,
    `${trimmed}2`,
    `${trimmed}_pay`,
    `${trimmed}2026`,
  ];
}
