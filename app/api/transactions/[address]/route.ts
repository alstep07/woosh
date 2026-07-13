import { NextRequest, NextResponse } from "next/server";
import { formatUnits } from "viem";
import { getInvoice } from "@/entities/invoice/lib/readInvoice";

const EXPLORER_BASE =
  process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://testnet.arcscan.app";
const REGISTRY         = (process.env.NEXT_PUBLIC_INVOICE_REGISTRY_ADDRESS ?? "").toLowerCase();
const STRATEGY_REGISTRY = (process.env.NEXT_PUBLIC_STRATEGY_REGISTRY_ADDRESS ?? "").toLowerCase();
const EXECUTOR          = (process.env.EXECUTOR_ADDRESS ?? "").toLowerCase();
// Synthra Universal Router — delivers swap output directly to the recipient.
const SYNTHRA_ROUTER    = "0x7fcef1330b4c21f884d6894f3d6a56036e587aa9";

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
  token?: { address?: string; symbol?: string; decimals?: string | number };
};

function fmtUnits(value: string, decimals: number): string {
  const full = formatUnits(BigInt(value), decimals);
  // formatUnits never returns scientific notation, but guard anyway
  if (!full.includes(".")) return full;
  const [whole, frac] = full.split(".");
  const trimmed = frac.replace(/0+$/, "").slice(0, 8);
  const result = trimmed ? `${whole}.${trimmed}` : whole;
  // Convert any scientific notation (e.g. 9.2e-7) to fixed decimal string
  if (result.includes("e") || result.includes("E")) {
    return Number(result).toFixed(8).replace(/\.?0+$/, "");
  }
  return result;
}

const addr = (a: { hash: string } | string | null): string | null =>
  a ? (typeof a === "string" ? a : a.hash).toLowerCase() : null;

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
        const raw = tx.raw_input;
        if (raw && raw.length >= 74) {
          const inv = await getInvoice(`0x${raw.slice(10, 74)}` as `0x${string}`);
          if (inv?.memo) entry.memo = inv.memo;
        }
        if (entry.memo !== undefined || entry.timestamp !== undefined) {
          info.set(hash.toLowerCase(), entry);
        }
      } catch { /* best effort */ }
    })
  );

  if (info.size === 0) return rows;
  return rows.map((r) => {
    if (r.note !== "Invoice") return r;
    const e = info.get(r.hash.toLowerCase());
    if (!e) return r;
    return { ...r, ...(e.memo ? { memo: e.memo } : {}), ...(e.timestamp ? { timestamp: e.timestamp } : {}) };
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
      const res = await fetch(`${EXPLORER_BASE}/api/v2/addresses/${address}/${path}`, { cache: "no-store" });
      if (!res.ok) return [];
      const data = (await res.json()) as { items?: unknown[]; result?: unknown[] };
      return (data.items ?? data.result ?? []) as RawTx[];
    } catch { return []; }
  }

  try {
    const [topItems, internalItems, tokenItems] = await Promise.all([
      fetchItems("transactions"),
      fetchItems("internal-transactions"),
      fetchItems("token-transfers") as Promise<unknown[]>,
    ]);

    const fromTop: OutTx[] = topItems
      .filter((tx) => {
        if (!tx.value || BigInt(tx.value) === 0n) return false;
        // Hide USDC native sends from user to executor: they're the "fund swap" step and
        // are paired with the token received on the other side (see pairSwapLegs).
        const from = addr(tx.from);
        const to   = addr(tx.to);
        if (EXECUTOR && from === lower && to === EXECUTOR) return false;
        return true;
      })
      .map((tx) => {
        const from = addr(tx.from)!;
        const to   = addr(tx.to);
        const direction = from === lower ? "sent" : "received";
        const counterparty = (direction === "sent" ? to : from) ?? from;
        const isInvoice  = !!REGISTRY && to === REGISTRY;
        const isStrategy = !!STRATEGY_REGISTRY && to === STRATEGY_REGISTRY;
        // Native USDC received from the Synthra router = swap output (sell direction output).
        const isSwapOutput = direction === "received" && from === SYNTHRA_ROUTER;
        return {
          hash: (tx.hash ?? tx.transaction_hash) as string,
          from,
          counterparty,
          direction,
          amount: (Number(BigInt(tx.value)) / 1e18).toFixed(2),
          timestamp: Math.floor(new Date(tx.timestamp).getTime() / 1000),
          ...(isInvoice ? { note: "Invoice" }
            : isStrategy ? { note: "Strategy" }
            : isSwapOutput ? { note: "Swap" }
            : {}),
        };
      });

    const fromInternal: OutTx[] = internalItems
      .filter((tx) => {
        const to   = addr(tx.to);
        const from = addr(tx.from);
        const fromRegistry =
          (!!REGISTRY && from === REGISTRY) ||
          (!!STRATEGY_REGISTRY && from === STRATEGY_REGISTRY);
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

    // ERC-20 token transfers: swap outputs (EURC/cirBTC received) and sell-direction funding.
    const USDC_ERC20 = "0x3600000000000000000000000000000000000000";
    const fromTokens: OutTx[] = (tokenItems as RawTokenTransfer[])
      .map((t) => {
        const from = addr(t.from);
        const to   = addr(t.to);
        const value   = t.total?.value;
        const decimals = Number(t.total?.decimals ?? t.token?.decimals ?? 18);
        const symbol   = t.token?.symbol;
        if (!from || !to || !value || !symbol) return null;
        const direction: "sent" | "received" = from === lower ? "sent" : "received";
        const counterparty = direction === "sent" ? to : from;
        const fromExecutor = !!EXECUTOR && from === EXECUTOR;
        const toExecutor   = !!EXECUTOR && to === EXECUTOR;
        const isUSDC = (t.token?.address ?? "").toLowerCase() === USDC_ERC20;
        const ts = t.timestamp ? Math.floor(new Date(t.timestamp).getTime() / 1000) : 0;

        // Hide ERC-20 sends to executor — they're the internal "fund swap" step for
        // sell-direction swaps (same as native USDC sends are hidden in fromTop).
        if (direction === "sent" && toExecutor) return null;

        let note: string | undefined;
        if (direction === "received" && isUSDC && fromExecutor) {
          note = "Swap refund"; // failed swap, USDC returned
        } else if (direction === "received" && !isUSDC) {
          note = "Swap"; // EURC or cirBTC arriving = swap output (DCA or manual)
        }

        return {
          hash: (t.transaction_hash ?? t.tx_hash) as string,
          from,
          counterparty,
          direction,
          amount: fmtUnits(value, decimals),
          timestamp: ts,
          token: symbol,
          ...(note ? { note } : {}),
        } as OutTx;
      })
      .filter((x): x is OutTx => x !== null && !!x.hash);

    const all = await enrichInvoices([...fromInternal, ...fromTop, ...fromTokens]);

    const seen = new Set<string>();
    const deduped = all
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter((tx) => {
        const key = `${tx.hash}-${tx.direction}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    const merged = deduped.slice(0, 30);

    return NextResponse.json(merged);
  } catch (err) {
    console.error("[transactions]", err);
    return NextResponse.json([]);
  }
}
