import { NextRequest, NextResponse } from "next/server";
import { createPortfolioCreateChallenge, createStrategyCreateChallenge, getUserWallets } from "@/shared/lib/circle";
import { resolveSlug } from "@/entities/slug/lib/resolveSlug";
import { BPS_DENOM } from "@/entities/strategy/lib/allocation";
import { tokenBySymbol } from "@/shared/lib/tokens";

function isAuthError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  const code = (err as { response?: { data?: { code?: number } } })?.response?.data?.code;
  const msg = ((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "").toLowerCase();
  return (
    status === 401 ||
    code === 90001 ||
    msg.includes("invalid user token") ||
    msg.includes("token expired") ||
    msg.includes("unauthorized")
  );
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function POST(req: NextRequest) {
  const registry = process.env.NEXT_PUBLIC_STRATEGY_REGISTRY_ADDRESS as `0x${string}` | undefined;
  if (!registry) {
    return NextResponse.json({ error: "Strategy registry not configured" }, { status: 400 });
  }

  try {
    const {
      userToken,
      salt,
      kind,
      recipient,
      tokenOut,
      amountPerPeriod,
      intervalSeconds,
      periodsTotal,
      funding,
      allocation,   // portfolio: [{ symbol: "USDC" | "EURC" | "cirBTC", bps: number }]
      mode,         // portfolio: "deposit" | "sweep"
      sweepThreshold, // portfolio sweep: human decimal USDC
    } = await req.json();

    if (!userToken || !salt || !amountPerPeriod) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!/^\d+$/.test(String(salt))) {
      return NextResponse.json({ error: "Invalid salt" }, { status: 400 });
    }
    if (kind !== "payment" && kind !== "swap" && kind !== "portfolio") {
      return NextResponse.json({ error: "kind must be 'payment', 'swap' or 'portfolio'" }, { status: 400 });
    }
    const isSweep = kind === "portfolio" && mode === "sweep";
    if (!isSweep && !funding) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!/^\d+(\.\d+)?$/.test(String(amountPerPeriod)) || parseFloat(amountPerPeriod) <= 0) {
      return NextResponse.json({ error: "Invalid amountPerPeriod" }, { status: 400 });
    }
    if (!isSweep && parseFloat(funding) < parseFloat(amountPerPeriod)) {
      return NextResponse.json({ error: "funding must be >= amountPerPeriod" }, { status: 400 });
    }
    const interval = Number(intervalSeconds);
    if (!Number.isInteger(interval) || interval <= 0) {
      return NextResponse.json({ error: "Invalid intervalSeconds" }, { status: 400 });
    }
    const periods = Number(periodsTotal ?? 0);
    if (!Number.isInteger(periods) || periods < 0) {
      return NextResponse.json({ error: "Invalid periodsTotal" }, { status: 400 });
    }

    // Portfolio: validate allocation, map symbols to addresses, build the challenge.
    if (kind === "portfolio") {
      if (mode !== "deposit" && mode !== "sweep") {
        return NextResponse.json({ error: "mode must be 'deposit' or 'sweep'" }, { status: 400 });
      }
      const legs = Array.isArray(allocation) ? allocation : [];
      if (legs.length < 2 || legs.length > 5) {
        return NextResponse.json({ error: "allocation needs 2 to 5 legs" }, { status: 400 });
      }
      const tokens: string[] = [];
      const bps: number[] = [];
      let sum = 0;
      let hasSwapLeg = false;
      for (const leg of legs) {
        const b = Number(leg?.bps);
        if (!Number.isInteger(b) || b <= 0) {
          return NextResponse.json({ error: "Each leg needs a positive integer bps" }, { status: 400 });
        }
        const sym = String(leg?.symbol ?? "").trim();
        if (sym === "USDC") {
          tokens.push("");
        } else {
          const t = tokenBySymbol(sym);
          if (!t?.address) {
            return NextResponse.json({ error: `Unsupported allocation token "${sym}"` }, { status: 400 });
          }
          tokens.push(t.address);
          hasSwapLeg = true;
        }
        bps.push(b);
        sum += b;
      }
      if (sum !== BPS_DENOM) {
        return NextResponse.json({ error: "Allocation must sum to 100%" }, { status: 400 });
      }
      if (!hasSwapLeg) {
        return NextResponse.json({ error: "Allocation needs at least one non-USDC leg" }, { status: 400 });
      }
      const threshold = String(sweepThreshold ?? "0");
      if (isSweep && (!/^\d+(\.\d+)?$/.test(threshold) || parseFloat(threshold) < 0)) {
        return NextResponse.json({ error: "Invalid sweepThreshold" }, { status: 400 });
      }

      const wallets = await getUserWallets(userToken);
      const wallet = wallets[0];
      if (!wallet) {
        return NextResponse.json({ error: "No Woosh wallet found. Sign up first." }, { status: 404 });
      }
      const result = await createPortfolioCreateChallenge(
        userToken,
        wallet.id,
        registry,
        String(salt),
        tokens,
        bps,
        isSweep ? 1 : 0,
        String(amountPerPeriod),
        isSweep ? threshold : "0",
        interval,
        periods,
        isSweep ? null : String(funding)
      );
      return NextResponse.json({ ...result, walletId: wallet.id });
    }

    // Resolve the per-kind required address.
    let resolvedRecipient = "";
    let resolvedTokenOut = "";
    if (kind === "payment") {
      const to = String(recipient ?? "").trim();
      resolvedRecipient = ADDRESS_RE.test(to) ? to : ((await resolveSlug(to)) ?? "");
      if (!ADDRESS_RE.test(resolvedRecipient)) {
        return NextResponse.json({ error: `Recipient "${recipient}" not found` }, { status: 404 });
      }
    } else {
      const out = String(tokenOut ?? "").trim();
      if (!ADDRESS_RE.test(out)) {
        return NextResponse.json({ error: "Invalid tokenOut for swap strategy" }, { status: 400 });
      }
      resolvedTokenOut = out;
    }

    const wallets = await getUserWallets(userToken);
    const wallet = wallets[0];
    if (!wallet) {
      return NextResponse.json({ error: "No Woosh wallet found. Sign up first." }, { status: 404 });
    }

    const result = await createStrategyCreateChallenge(
      userToken,
      wallet.id,
      registry,
      String(salt),
      kind === "swap" ? 1 : 0,
      resolvedRecipient,
      resolvedTokenOut,
      String(amountPerPeriod),
      interval,
      periods,
      String(funding)
    );
    return NextResponse.json({ ...result, walletId: wallet.id });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Token expired. Please re-authenticate." }, { status: 401 });
    }
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? (err instanceof Error ? err.message : "Failed to create strategy");
    console.error("[create-strategy]", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
