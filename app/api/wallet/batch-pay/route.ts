import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "viem";
import { createBatchPayChallenge, getUserWallets } from "@/shared/lib/circle";
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
const MAX_RECIPIENTS = 20;

type Leg = { to: string; amount: string };

export async function POST(req: NextRequest) {
  const batchPay = process.env.NEXT_PUBLIC_BATCH_PAY_ADDRESS as `0x${string}` | undefined;
  if (!batchPay) {
    return NextResponse.json({ error: "Batch pay not configured" }, { status: 400 });
  }

  try {
    const { userToken, legs, memo } = await req.json();
    if (!userToken || !Array.isArray(legs) || legs.length === 0) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (legs.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `At most ${MAX_RECIPIENTS} recipients` }, { status: 400 });
    }

    // Resolve every recipient (slug or address) and validate amounts server-side,
    // same as send-payment. Never trust client-resolved addresses.
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

    const wallets = await getUserWallets(userToken);
    const wallet = wallets[0];
    if (!wallet) {
      return NextResponse.json({ error: "No Woosh wallet found." }, { status: 404 });
    }

    const result = await createBatchPayChallenge(
      userToken,
      wallet.id,
      batchPay,
      recipients,
      amountsWei,
      String(memo ?? "").trim(),
      totalWei.toString()
    );
    return NextResponse.json({ ...result, walletId: wallet.id });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Token expired. Please re-authenticate." }, { status: 401 });
    }
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? (err instanceof Error ? err.message : "Failed to send batch payment");
    console.error("[batch-pay]", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
