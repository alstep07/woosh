import { arcPublicClient } from "@/shared/lib/arc";
import { env } from "@/shared/config/env";
import { INVOICE_REGISTRY_ABI } from "@/entities/invoice/model/abi";

/**
 * Authoritative paid status for a request, read straight from the contract.
 * Returns false if the registry isn't configured or the RPC fails (fail closed:
 * "not confirmed paid" is the safe default for a request).
 */
export async function isInvoicePaid(id: `0x${string}`): Promise<boolean> {
  if (!env.invoiceRegistryAddress) return false;
  try {
    return await arcPublicClient.readContract({
      address: env.invoiceRegistryAddress,
      abi: INVOICE_REGISTRY_ABI,
      functionName: "paid",
      args: [id],
    });
  } catch {
    return false;
  }
}
