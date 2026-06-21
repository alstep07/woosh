import { NextRequest, NextResponse } from "next/server";
import { formatUnits } from "viem";
import { getInvoice } from "@/entities/invoice/lib/readInvoice";

const EXPLORER_BASE =
  process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://explorer.testnet.arc.network";
const REGISTRY = (process.env.NEXT_PUBLIC_INVOICE_REGISTRY_ADDRESS ?? "").toLowerCase();
const STRATEGY_REGISTRY = (process.env.NEXT_PUBLIC_STRATEGY_REGISTRY_ADDRESS ?? "").toLowerCase();
const EXECUTOR = (process.env.EXECUTOR_ADDRESS ?? "").toLowerCase();

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
  token?: string;
};

type RawTokenTransfer = {
  transaction_hash?: string;
  tx_hash?: string;
  from: { hash: string } | string;
  to: { hash: string } | string | null;
  timestamp?: string;
  total?: { value?: string; decimals?: string | number };
  token?: { symbol?: string; decimals?: string | number };
};

/**
 * Format a token amount for display. Uses full-precision formatUnits then trims trailing
 * zeros, capping fractional digits at 8 — so a tiny cirBTC amount (0.00002204) stays
 * meaningful instead of rounding to "0.00".
 */
function fmtUnits(value: string, decimals: number): string {
  const full = formatUnits(BigInt(value), decimals);
  if (!full.includes(".")) return full;
  const [whole, frac] = full.split(".");
  const trimmed = frac.replace(/0+$/, "").slice(0, 8);
  return trimmed ? `${whole}.${trimmed}` : whole;
}

const addr = (a: { hash: string } | string | null): string | null =>
  a ? (typeof a === "string" ? a : a.hash).toLowerCase() : null;

/**
 * Best-effort enrichment for invoice rows. Internal-tx receipts often lack a reliable
 * timestamp (so they'd sort to the bottom), and never carry the memo. For each invoice
 * tx we read the parent tx from the explorer: its timestamp is authoritative, and its
 * pay(bytes32) calldata gives the invoice id -> getInvoice(memo). Fails open.
 * Run this BEFORE sorting so the corrected timestamp orders the row correctly.
 */
async function enrichInvoices(rows: OutTx[]): Promise<OutTx[]> {
  if (!REGISTRY) return rows;
  const hashes = [...new Set(rows.filter((r) => r.note === "Invoice").map((r) => r.hash))];
  if (hashes.length === 0) return rows;

  const info = new Map<string, { memo?: string; timestamp?: number }>();
  await Promise.all(
    hashes.map(async (hash) => {
      try {
        const res = await fetch(`${EXPLORER_BASE}/api/v2/transactions/${hash}`, { cache: "no-store" });
        if (!res.ok) return;
        const tx = (await res.json()) as { raw_input?: string; timestamp?: string };
        const entry: { memo?: string; timestamp?: number } = {};
        const ts = tx.timestamp ? Math.floor(new Date(tx.timestamp).getTime() / 1000) : NaN;
        if (Number.isFinite(ts)) entry.timestamp = ts;
        const raw = tx.raw_input; // pay(bytes32): 0x + 8 hex selector + 64 hex id
        if (raw && raw.length >= 74) {
          const inv = await getInvoice(`0x${raw.slice(10, 74)}` as `0x${string}`);
          if (inv?.memo) entry.memo = inv.memo;
        }
        if (entry.memo !== undefined || entry.timestamp !== undefined) {
          info.set(hash.toLowerCase(), entry);
        }
      } catch {
        /* ignore — best effort */
      }
    })
  );

  if (info.size === 0) return rows;
  return rows.map((r) => {
    if (r.note !== "Invoice") return r;
    const e = info.get(r.hash.toLowerCase());
    if (!e) return r;
    return {
      ...r,
      ...(e.memo !== undefined ? { memo: e.memo } : {}),
      ...(e.timestamp !== undefined ? { timestamp: e.timestamp } : {}),
    };
  });
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
    const [topItems, internalItems, tokenItems] = await Promise.all([
      fetchItems("transactions"),
      fetchItems("internal-transactions"),
      fetchItems("token-transfers") as Promise<unknown[]>,
    ]);

    const fromTop: OutTx[] = topItems
      .filter((tx) => tx.value && BigInt(tx.value) > 0n)
      .map((tx) => {
        const from = addr(tx.from)!;
        const to = addr(tx.to);
        const direction = from === lower ? "sent" : "received";
        const counterparty = (direction === "sent" ? to : from) ?? from;
        const isInvoice = !!REGISTRY && to === REGISTRY; // paying an invoice
        const isStrategy = !!STRATEGY_REGISTRY && to === STRATEGY_REGISTRY; // fund/create a strategy
        return {
          hash: (tx.hash ?? tx.transaction_hash) as string,
          from,
          counterparty,
          direction,
          amount: (Number(BigInt(tx.value)) / 1e18).toFixed(2),
          timestamp: Math.floor(new Date(tx.timestamp).getTime() / 1000),
          ...(isInvoice ? { note: "Invoice" } : isStrategy ? { note: "Strategy" } : {}),
        };
      });

    // Receipts forwarded by a registry to the recipient (internal txs): invoice payouts and
    // recurring strategy payments both arrive this way.
    const fromInternal: OutTx[] = internalItems
      .filter((tx) => {
        const to = addr(tx.to);
        const from = addr(tx.from);
        const fromRegistry = (!!REGISTRY && from === REGISTRY) || (!!STRATEGY_REGISTRY && from === STRATEGY_REGISTRY);
        return !!tx.value && BigInt(tx.value) > 0n && to === lower && fromRegistry;
      })
      .map((tx) => {
        const from = addr(tx.from)!;
        const isStrategy = !!STRATEGY_REGISTRY && from === STRATEGY_REGISTRY;
        return {
          hash: (tx.transaction_hash ?? tx.hash) as string,
          from,
          counterparty: from,
          direction: "received" as const,
          amount: (Number(BigInt(tx.value)) / 1e18).toFixed(2),
          timestamp: Math.floor(new Date(tx.timestamp).getTime() / 1000),
          note: isStrategy ? "Strategy payment" : "Invoice",
        };
      });

    // ERC-20 receipts (DCA output: cirBTC / EURC sent by the executor to the owner).
    const fromTokens: OutTx[] = (tokenItems as RawTokenTransfer[])
      .map((t) => {
        const from = addr(t.from);
        const to = addr(t.to);
        const value = t.total?.value;
        const decimals = Number(t.total?.decimals ?? t.token?.decimals ?? 18);
        const symbol = t.token?.symbol;
        if (!from || !to || !value || !symbol) return null;
        const direction: "sent" | "received" = from === lower ? "sent" : "received";
        const counterparty = direction === "sent" ? to : from;
        const fromExecutor = !!EXECUTOR && from === EXECUTOR;
        const ts = t.timestamp ? Math.floor(new Date(t.timestamp).getTime() / 1000) : 0;
        return {
          hash: (t.transaction_hash ?? t.tx_hash) as string,
          from,
          counterparty,
          direction,
          amount: fmtUnits(value, decimals),
          timestamp: ts,
          token: symbol,
          ...(direction === "received" && fromExecutor ? { note: "DCA" } : {}),
        } as OutTx;
      })
      .filter((x): x is OutTx => x !== null && !!x.hash);

    // Enrich BEFORE sorting: internal receipts get their authoritative timestamp here,
    // so they order correctly (and aren't dropped from the dashboard's top 3).
    const all = await enrichInvoices([...fromInternal, ...fromTop, ...fromTokens]);

    const seen = new Set<string>();
    const merged = all
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter((tx) => {
        const key = `${tx.hash}-${tx.direction}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);

    return NextResponse.json(merged);
  } catch (err) {
    console.error("[transactions]", err);
    return NextResponse.json([]);
  }
}
