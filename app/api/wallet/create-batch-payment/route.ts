import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "viem";
import { createBatchPaymentChallenge, getUserWallets } from "@/shared/lib/circle";
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
const AMOUNT_RE = /^\d+(\.\d+)?$/;
const MAX_RECIPIENTS = 10; // WooshStrategyRegistry.MAX_BATCH_RECIPIENTS

type Leg = { to: string; amount: string };

/** Recurring payroll: WooshStrategyRegistry.createBatchPayment, every period forwards
 *  every leg. Separate from /api/wallet/create-strategy to keep that route's
 *  single-recipient validation simple; this mirrors its auth/response shape. */
export async function POST(req: NextRequest) {
  const registry = process.env.NEXT_PUBLIC_STRATEGY_REGISTRY_ADDRESS as `0x${string}` | undefined;
  if (!registry) {
    return NextResponse.json({ error: "Strategy registry not configured" }, { status: 400 });
  }

  try {
    const { userToken, salt, legs, memo, intervalSeconds, periodsTotal, funding } = await req.json();
    if (!userToken || !salt || !Array.isArray(legs) || legs.length < 2) {
      return NextResponse.json({ error: "Batch payroll needs at least 2 recipients" }, { status: 400 });
    }
    if (legs.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `At most ${MAX_RECIPIENTS} recipients` }, { status: 400 });
    }
    if (!/^\d+$/.test(String(salt))) {
      return NextResponse.json({ error: "Invalid salt" }, { status: 400 });
    }
    const interval = Number(intervalSeconds);
    if (!Number.isInteger(interval) || interval <= 0) {
      return NextResponse.json({ error: "Invalid intervalSeconds" }, { status: 400 });
    }
    const periods = Number(periodsTotal ?? 0);
    if (!Number.isInteger(periods) || periods < 0) {
      return NextResponse.json({ error: "Invalid periodsTotal" }, { status: 400 });
    }
    if (!AMOUNT_RE.test(String(funding)) || parseFloat(funding) <= 0) {
      return NextResponse.json({ error: "Invalid funding" }, { status: 400 });
    }

    const recipients: string[] = [];
    const amountsWei: string[] = [];
    let totalWei = 0n;
    for (const leg of legs as Leg[]) {
      const to = String(leg?.to ?? "").trim();
      const amount = String(leg?.amount ?? "").trim();
      if (!AMOUNT_RE.test(amount) || parseFloat(amount) <= 0) {
        return NextResponse.json({ error: `Invalid amount for "${to}"` }, { status: 400 });
      }
      const resolved = ADDRESS_RE.test(to) ? to : await resolveSlug(to);
      if (!resolved || !ADDRESS_RE.test(resolved)) {
        return NextResponse.json({ error: `Recipient "${to}" not found` }, { status: 404 });
      }
      const wei = parseUnits(amount, 18);
      recipients.push(resolved);
      amountsWei.push(wei.toString());
      totalWei += wei;
    }
    if (parseUnits(String(funding), 18) < totalWei) {
      return NextResponse.json({ error: "funding must be >= sum of amounts" }, { status: 400 });
    }

    const wallets = await getUserWallets(userToken);
    const wallet = wallets[0];
    if (!wallet) {
      return NextResponse.json({ error: "No Woosh wallet found. Sign up first." }, { status: 404 });
    }

    const result = await createBatchPaymentChallenge(
      userToken,
      wallet.id,
      registry,
      String(salt),
      recipients,
      amountsWei,
      String(memo ?? "").trim(),
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
      ?? (err instanceof Error ? err.message : "Failed to create batch payment");
    console.error("[create-batch-payment]", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
