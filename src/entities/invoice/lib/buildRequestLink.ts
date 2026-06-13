import { env } from "@/shared/config/env";

/**
 * Shareable link for an invoice. Carries ONLY the invoice id — amount, memo and payee
 * are read from the contract. No recipient name in the URL, so nothing there can be
 * tampered with or misread.
 */
export function buildRequestLink(id: string): string {
  return `${env.baseUrl}/i/${id}`;
}
