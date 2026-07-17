import { NextRequest, NextResponse } from "next/server";
import { createStrategyCreateChallenge, getUserWallets } from "@/shared/lib/circle";
import { resolveSlug } from "@/entities/slug/lib/resolveSlug";

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
    } = await req.json();

    if (!userToken || !salt || !amountPerPeriod) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!/^\d+$/.test(String(salt))) {
      return NextResponse.json({ error: "Invalid salt" }, { status: 400 });
    }
    if (kind !== "payment" && kind !== "swap") {
      // Kind.Portfolio is frozen: no new creation anywhere (UI, chat, or direct API),
      // only existing plans stay manageable. See CLAUDE.md V3.1/V3.2 and
      // savings-vault-funding-methods memory for why: it's a different mechanism from
      // the WooshSavingsVault deposit/withdraw + auto-sweep that replaced it.
      return NextResponse.json(
        { error: "Portfolio automations are no longer creatable. Use the savings vault at /dashboard/savings instead." },
        { status: 400 }
      );
    }
    if (!funding) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!/^\d+(\.\d+)?$/.test(String(amountPerPeriod)) || parseFloat(amountPerPeriod) <= 0) {
      return NextResponse.json({ error: "Invalid amountPerPeriod" }, { status: 400 });
    }
    if (parseFloat(funding) < parseFloat(amountPerPeriod)) {
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
