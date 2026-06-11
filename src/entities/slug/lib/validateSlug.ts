/** Client-side slug validation — mirrors onchain rules in WooshSlugRegistry. */
export function validateSlug(slug: string): boolean {
  if (slug.length < 3 || slug.length > 32) return false;
  return /^[a-z0-9_]+$/.test(slug);
}
