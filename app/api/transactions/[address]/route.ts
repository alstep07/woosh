import { NextRequest, NextResponse } from "next/server";
import { arcPublicClient } from "@/shared/lib/arc";
import { INVOICE_REGISTRY_ABI } from "@/entities/invoice/model/abi";
import { getInvoice } from "@/entities/invoice/lib/readInvoice";

const EXPLORER_BASE =
  process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://explorer.testnet.arc.network";
const REGISTRY = (process.env.NEXT_PUBLIC_INVOICE_REGISTRY_ADDRESS ?? "").toLowerCase();

type RawTx = {
  hash?: string;
  transaction_hash?: string;
  from: { hash: string } | string;
  to: { hash: string } | string | null;
  value: string;
  timestamp: string;
};

type OutTx = {
  hash: string;
  from: string;
  counterparty: string;
  direction: "sent" | "received";
  amount: string;
  timestamp: number;
  note?: string;
  memo?: string;
};

const addr = (a: { hash: string } | string | null): string | null =>
  a ? (typeof a === "string" ? a : a.hash).toLowerCase() : null;

/**
 * Best-effort: attach each invoice row's on-chain memo by matching the tx hash to an
 * InvoicePaid event → invoice id → getInvoice(memo). Fails open (no memo) on any error.
 */
async function enrichInvoiceMemos(rows: OutTx[], address: string): Promise<OutTx[]> {
  if (!REGISTRY) return rows;
  const hasInvoice = rows.some((r) => r.note === "Invoice");
  if (!hasInvoice) return rows;

  try {
    const reg = REGISTRY as `0x${string}`;
    const lower = address.toLowerCase() as `0x${string}`;
    const [asPayee, asPayer] = await Promise.all([
      arcPublicClient.getContractEvents({ address: reg, abi: INVOICE_REGISTRY_ABI, eventName: "InvoicePaid", args: { payee: lower }, fromBlock: 0n }),
      arcPublicClient.getContractEvents({ address: reg, abi: INVOICE_REGISTRY_ABI, eventName: "InvoicePaid", args: { payer: lower }, fromBlock: 0n }),
    ]);

    const hashToId = new Map<string, `0x${string}`>();
    for (const ev of [...asPayee, ...asPayer]) {
      const h = ev.transactionHash?.toLowerCase();
      const id = ev.args.id;
      if (h && id) hashToId.set(h, id);
    }

    const ids = [...new Set(hashToId.values())];
    const memoById = new Map<string, string>();
    await Promise.all(
      ids.map(async (id) => {
        const inv = await getInvoice(id);
        if (inv?.memo) memoById.set(id, inv.memo);
      })
    );

    return rows.map((r) => {
      if (r.note !== "Invoice") return r;
      const id = hashToId.get(r.hash.toLowerCase());
      const memo = id ? memoById.get(id) : undefined;
      return memo ? { ...r, memo } : r;
    });
  } catch {
    return rows;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  const { address } = params;
  const lower = address.toLowerCase();

  async function fetchItems(path: string): Promise<RawTx[]> {
    try {
      const res = await fetch(`${EXPLORER_BASE}/api/v2/addresses/${address}/${path}`, {
        cache: "no-store",
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { items?: unknown[]; result?: unknown[] };
      return (data.items ?? data.result ?? []) as RawTx[];
    } catch {
      return [];
    }
  }

  try {
    // Top-level txs miss invoice receipts (the registry forwards funds to the payee
    // as an INTERNAL tx), so we also read internal-transactions and merge them.
    const [topItems, internalItems] = await Promise.all([
      fetchItems("transactions"),
      fetchItems("internal-transactions"),
    ]);

    const fromTop: OutTx[] = topItems
      .filter((tx) => tx.value && BigInt(tx.value) > 0n)
      .map((tx) => {
        const from = addr(tx.from)!;
        const to = addr(tx.to);
        const direction = from === lower ? "sent" : "received";
        const counterparty = (direction === "sent" ? to : from) ?? from;
        const isInvoice = !!REGISTRY && to === REGISTRY; // paying an invoice
        return {
          hash: (tx.hash ?? tx.transaction_hash) as string,
          from,
          counterparty,
          direction,
          amount: (Number(BigInt(tx.value)) / 1e18).toFixed(2),
          timestamp: Math.floor(new Date(tx.timestamp).getTime() / 1000),
          ...(isInvoice ? { note: "Invoice" } : {}),
        };
      });

    // Invoice receipts: registry -> payee internal transfers.
    const fromInternal: OutTx[] = internalItems
      .filter((tx) => {
        const to = addr(tx.to);
        const from = addr(tx.from);
        return !!tx.value && BigInt(tx.value) > 0n && to === lower && !!REGISTRY && from === REGISTRY;
      })
      .map((tx) => {
        const from = addr(tx.from)!;
        return {
          hash: (tx.transaction_hash ?? tx.hash) as string,
          from,
          counterparty: from,
          direction: "received" as const,
          amount: (Number(BigInt(tx.value)) / 1e18).toFixed(2),
          timestamp: Math.floor(new Date(tx.timestamp).getTime() / 1000),
          note: "Invoice",
        };
      });

    const seen = new Set<string>();
    const merged = [...fromInternal, ...fromTop]
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter((tx) => {
        const key = `${tx.hash}-${tx.direction}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);

    const enriched = await enrichInvoiceMemos(merged, lower);
    return NextResponse.json(enriched);
  } catch (err) {
    console.error("[transactions]", err);
    return NextResponse.json([]);
  }
}
