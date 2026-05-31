/**
 * V1 user store — slug ↔ wallet mapping.
 *
 * Uses a module-level Map so data persists across requests in the same
 * Next.js server process. For V2, replace with Supabase.
 *
 * Server-side only.
 */

export type UserRecord = {
  email: string;
  slug: string;
  walletId: string;
  walletAddress: string;
};

// Module-level store (survives hot-reloads in dev via global)
const g = globalThis as typeof globalThis & {
  _wooshStore?: Map<string, UserRecord>;
};
if (!g._wooshStore) g._wooshStore = new Map();
const store: Map<string, UserRecord> = g._wooshStore;

export function getUserBySlug(slug: string): UserRecord | undefined {
  return store.get(slug);
}

export function getUserByEmail(email: string): UserRecord | undefined {
  for (const user of Array.from(store.values())) {
    if (user.email === email) return user;
  }
  return undefined;
}

export function saveUser(user: UserRecord): void {
  store.set(user.slug, user);
}

export function slugExists(slug: string): boolean {
  return store.has(slug);
}

/** Derives base slug from email local part and appends suffix until unique. */
export function assignSlug(email: string): string {
  const base = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!slugExists(base)) return base;
  let i = 1;
  while (slugExists(`${base}${i}`)) i++;
  return `${base}${i}`;
}
