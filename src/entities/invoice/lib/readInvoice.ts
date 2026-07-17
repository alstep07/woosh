import { formatUnits } from "viem";
import { arcPublicClient } from "@/shared/lib/arc";
import { env } from "@/shared/config/env";
import { INVOICE_REGISTRY_ABI } from "@/entities/invoice/model/abi";
import type { OnchainInvoice } from "@/entities/invoice/model/types";

const ZERO = "0x0000000000000000000000000000000000000000";

/** Read one invoice from the contract. null if the id is unknown (zero payee).
 *  Throws on RPC failure — callers that want "null on any failure" use getInvoice. */
async function readInvoiceOrThrow(id: `0x${string}`): Promise<OnchainInvoice | null> {
  const [payee, amount, paid, payer, memo, createdAt] = await arcPublicClient.readContract({
    address: env.invoiceRegistryAddress!,
    abi: INVOICE_REGISTRY_ABI,
    functionName: "getInvoice",
    args: [id],
  });
  if (payee.toLowerCase() === ZERO) return null;
  return {
    id,
    payee,
    amount: formatUnits(amount, 18),
    paid,
    payer: paid ? payer : null,
    memo,
    createdAt: Number(createdAt),
  };
}

/** Read one invoice from the contract. null if not found / not configured / RPC error. */
export async function getInvoice(id: `0x${string}`): Promise<OnchainInvoice | null> {
  if (!env.invoiceRegistryAddress) return null;
  try {
    return await readInvoiceOrThrow(id);
  } catch {
    return null;
  }
}

/** The creator's own requests, read straight from the chain (newest first). Throws on
 *  RPC failure so react-query can surface isError instead of a false empty state. */
export async function getMyInvoices(creator: `0x${string}`): Promise<OnchainInvoice[]> {
  if (!env.invoiceRegistryAddress) return [];
  const ids = (await arcPublicClient.readContract({
    address: env.invoiceRegistryAddress,
    abi: INVOICE_REGISTRY_ABI,
    functionName: "getInvoiceIds",
    args: [creator],
  })) as readonly `0x${string}`[];

  // Per-invoice reads must also throw: swallowing one leg's RPC error would silently
  // drop that invoice from the list ("you have fewer invoices than you do") and commit
  // the shrunken list to the query cache as if it were a successful fetch.
  const invoices = await Promise.all([...ids].reverse().map((id) => readInvoiceOrThrow(id)));
  return invoices.filter((x): x is OnchainInvoice => x !== null);
}
