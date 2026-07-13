import { NextResponse } from "next/server";

/**
 * USD prices for cirBTC (tracks BTC) and EURC (tracks EUR), proxied server-side.
 * The dashboard used to call CoinGecko straight from the browser, which broke
 * intermittently: the free tier rate-limits per IP (30s polling trips it fast) and
 * adblockers block the domain outright, silently hiding the $ equivalents.
 * One upstream call per server instance per TTL serves every client, and the last
 * known good prices are returned if an upstream refresh fails.
 */
let cache: { btc?: number; eur?: number } = {};
let fetchedAt = 0;
const TTL_MS = 60_000;

export const dynamic = "force-dynamic";

export async function GET() {
  if (Date.now() - fetchedAt > TTL_MS) {
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,euro-coin&vs_currencies=usd",
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          bitcoin?: { usd?: number };
          "euro-coin"?: { usd?: number };
        };
        const btc = data.bitcoin?.usd;
        const eur = data["euro-coin"]?.usd;
        if (btc != null || eur != null) {
          cache = { btc: btc ?? cache.btc, eur: eur ?? cache.eur };
          fetchedAt = Date.now();
        }
      }
    } catch {
      /* keep last known good prices */
    }
  }
  return NextResponse.json(cache);
}
