import { NextRequest, NextResponse } from "next/server";

const EXPLORER_BASE =
  process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://explorer.testnet.arc.network";

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  const { address } = params;
  const lower = address.toLowerCase();

  try {
    const res = await fetch(
      `${EXPLORER_BASE}/api/v2/addresses/${address}/transactions`,
      { cache: "no-store" }
    );

    if (!res.ok) throw new Error(`Explorer returned ${res.status}`);

    const data = await res.json() as {
      items?: unknown[];
      result?: unknown[];
    };

    const items = (data.items ?? data.result ?? []) as Array<{
      hash: string;
      from: { hash: string } | string;
      to: { hash: string } | string | null;
      value: string;
      timestamp: string;
    }>;

    const txs = items
      .filter((tx) => tx.value && BigInt(tx.value) > 0n)
      .slice(0, 20)
      .map((tx) => {
        const from = (typeof tx.from === "string" ? tx.from : tx.from.hash).toLowerCase();
        const to = tx.to ? (typeof tx.to === "string" ? tx.to : tx.to.hash).toLowerCase() : null;
        const direction = from === lower ? "sent" : "received";
        const counterparty = (direction === "sent" ? to : from) ?? from;
        return {
          hash: tx.hash as `0x${string}`,
          from: from as `0x${string}`,
          counterparty: counterparty as `0x${string}`,
          direction,
          amount: (Number(BigInt(tx.value)) / 1e18).toFixed(2),
          timestamp: Math.floor(new Date(tx.timestamp).getTime() / 1000),
        };
      });

    return NextResponse.json(txs);
  } catch (err) {
    console.error("[transactions]", err);
    return NextResponse.json([]);
  }
}
