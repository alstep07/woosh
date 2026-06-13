import { env } from "@/shared/config/env";

/**
 * Shareable link for a payment request. Carries ONLY the invoice id — amount, memo
 * and payee are read from the contract, so nothing in the URL can be tampered with.
 * `identifier` is the payee's slug (preferred) or raw address, for a friendly URL.
 */
export function buildRequestLink(identifier: string, id: string): string {
  return `${env.baseUrl}/pay/${identifier}?req=${id}`;
}
