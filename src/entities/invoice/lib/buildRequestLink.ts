import { env } from "@/shared/config/env";

/**
 * Shareable link for a payment request. The link IS the request — it carries the
 * amount and the nonce, so PaymentForm settles it against WooshInvoiceRegistry.
 * `identifier` is the payee's slug (preferred) or raw address.
 */
export function buildRequestLink(identifier: string, amount: string, nonce: string): string {
  return `${env.baseUrl}/pay/${identifier}?amount=${encodeURIComponent(amount)}&req=${nonce}`;
}
