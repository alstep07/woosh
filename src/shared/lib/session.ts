/**
 * Central session module — single source of truth for all woosh_* storage keys.
 * All calls are wrapped in try-catch so Safari private mode never crashes the app.
 */
import type { Session } from "@/entities/user/model/types";

// ── localStorage ──────────────────────────────────────────────────────────────

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem("woosh_session");
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  try {
    localStorage.setItem("woosh_session", JSON.stringify(session));
  } catch {}
}

// ── sessionStorage — live session tokens (ChatPanel cached auth) ──────────────

export function getCachedTokens(): { userToken: string; encryptionKey: string } | null {
  try {
    const token = sessionStorage.getItem("woosh_session_token");
    const key = sessionStorage.getItem("woosh_session_enc_key");
    if (!token || !key) return null;
    return { userToken: token, encryptionKey: key };
  } catch {
    return null;
  }
}

export function setCachedTokens(userToken: string, encryptionKey: string): void {
  try {
    sessionStorage.setItem("woosh_session_token", userToken);
    sessionStorage.setItem("woosh_session_enc_key", encryptionKey);
  } catch {}
}

export function clearCachedTokens(): void {
  try {
    sessionStorage.removeItem("woosh_session_token");
    sessionStorage.removeItem("woosh_session_enc_key");
  } catch {}
}

// ── sessionStorage — pending tokens (signup → slug-setup handoff) ─────────────

export function getPendingTokens(): { userToken: string; encryptionKey: string } | null {
  try {
    const token = sessionStorage.getItem("woosh_pending_token");
    const key = sessionStorage.getItem("woosh_pending_enc_key");
    if (!token || !key) return null;
    return { userToken: token, encryptionKey: key };
  } catch {
    return null;
  }
}

export function setPendingTokens(userToken: string, encryptionKey: string): void {
  try {
    sessionStorage.setItem("woosh_pending_token", userToken);
    sessionStorage.setItem("woosh_pending_enc_key", encryptionKey);
  } catch {}
}

export function clearPendingTokens(): void {
  try {
    sessionStorage.removeItem("woosh_pending_token");
    sessionStorage.removeItem("woosh_pending_enc_key");
  } catch {}
}

// ── Nuclear option: wipe every woosh_* key from both stores ──────────────────
// Use on logout. Iterates so it can't miss newly-added keys.

export function clearAll(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("woosh_"))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith("woosh_"))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch {}
}
