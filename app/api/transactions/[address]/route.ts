import { NextRequest, NextResponse } from "next/server";
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
 * Best-effort: attach each invoice row's onchain memo. For each invoice tx we read it
 * from the explorer, decode the invoice id from the pay(bytes32) calldata, then read
 * getInvoice(memo). Works for both sides (the parent tx is always the pay() call).
 * Fails open (no memo) on any error.
 */
async function enrichInvoiceMemos(rows: OutTx[]): Promise<OutTx[]> {
  if (!REGISTRY) return rows;
  const hashes = [...new Set(rows.filter((r) => r.note === "Invoice").map((r) => r.hash))];
  if (hashes.length === 0) return rows;

  const memoByHash = new Map<string, string>();
  await Promise.all(
    hashes.map(async (hash) => {
      try {
        const res = await fetch(`${EXPLORER_BASE}/api/v2/transactions/${hash}`, { cache: "no-store" });
        if (!res.ok) return;
        const tx = (await res.json()) as { raw_input?: string };
        const raw = tx.raw_input;
        // pay(bytes32): 0x + 4-byte selector (8 hex) + 32-byte id (64 hex)
        if (!raw || raw.length < 74) return;
        const id = `0x${raw.slice(10, 74)}` as `0x${string}`;
        const inv = await getInvoice(id);
        if (inv?.memo) memoByHash.set(hash.toLowerCase(), inv.memo);
      } catch {
        /* ignore — best effort */
      }
    })
  );

  if (memoByHash.size === 0) return rows;
  return rows.map((r) =>
    r.note === "Invoice" && memoByHash.has(r.hash.toLowerCase())
      ? { ...r, memo: memoByHash.get(r.hash.toLowerCase()) }
      : r
  );
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

    const enriched = await enrichInvoiceMemos(merged);
    return NextResponse.json(enriched);
  } catch (err) {
    console.error("[transactions]", err);
    return NextResponse.json([]);
  }
}
