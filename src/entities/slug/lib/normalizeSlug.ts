/**
 * Derive a slug suggestion from an email local-part.
 * Lowercases, replaces disallowed chars with underscore, trims to 32 chars.
 */
export function normalizeSlug(emailLocalPart: string): string {
  return emailLocalPart
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 32);
}
