import { formatUnits } from "viem";
import { arcPublicClient } from "@/shared/lib/arc";
import { env } from "@/shared/config/env";
import { INVOICE_REGISTRY_ABI } from "@/entities/invoice/model/abi";
import type { OnchainInvoice } from "@/entities/invoice/model/types";

const ZERO = "0x0000000000000000000000000000000000000000";

/** Read one invoice from the contract. null if not found / not configured / RPC error. */
export async function getInvoice(id: `0x${string}`): Promise<OnchainInvoice | null> {
  if (!env.invoiceRegistryAddress) return null;
  try {
    const [payee, amount, paid, payer, memo, createdAt] = await arcPublicClient.readContract({
      address: env.invoiceRegistryAddress,
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
  } catch {
    return null;
  }
}

/** The creator's own requests, read straight from the chain (newest first). */
export async function getMyInvoices(creator: `0x${string}`): Promise<OnchainInvoice[]> {
  if (!env.invoiceRegistryAddress) return [];
  try {
    const ids = (await arcPublicClient.readContract({
      address: env.invoiceRegistryAddress,
      abi: INVOICE_REGISTRY_ABI,
      functionName: "getInvoiceIds",
      args: [creator],
    })) as readonly `0x${string}`[];

    const invoices = await Promise.all([...ids].reverse().map((id) => getInvoice(id)));
    return invoices.filter((x): x is OnchainInvoice => x !== null);
  } catch {
    return [];
  }
}
