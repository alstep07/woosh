import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "viem";
import { createSavingsSweepSetupChallenge, getUserWallets } from "@/shared/lib/circle";

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

const AMOUNT_RE = /^\d+(\.\d+)?$/;

export async function POST(req: NextRequest) {
  const vault = process.env.NEXT_PUBLIC_SAVINGS_VAULT_ADDRESS as `0x${string}` | undefined;
  if (!vault) {
    return NextResponse.json({ error: "Savings vault not configured" }, { status: 400 });
  }

  try {
    const { userToken, threshold, capPerRun, intervalSeconds } = await req.json();
    if (!userToken) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!AMOUNT_RE.test(String(threshold)) || parseFloat(threshold) < 0) {
      return NextResponse.json({ error: "Invalid threshold" }, { status: 400 });
    }
    if (!AMOUNT_RE.test(String(capPerRun)) || parseFloat(capPerRun) <= 0) {
      return NextResponse.json({ error: "Invalid capPerRun" }, { status: 400 });
    }
    const interval = Number(intervalSeconds);
    if (!Number.isInteger(interval) || interval <= 0) {
      return NextResponse.json({ error: "Invalid intervalSeconds" }, { status: 400 });
    }

    const wallets = await getUserWallets(userToken);
    const wallet = wallets[0];
    if (!wallet) {
      return NextResponse.json({ error: "No Woosh wallet found. Sign up first." }, { status: 404 });
    }

    const result = await createSavingsSweepSetupChallenge(
      userToken,
      wallet.id,
      vault,
      parseUnits(String(threshold), 18).toString(),
      parseUnits(String(capPerRun), 18).toString(),
      interval
    );
    return NextResponse.json({ ...result, walletId: wallet.id });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Token expired. Please re-authenticate." }, { status: 401 });
    }
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? (err instanceof Error ? err.message : "Failed to set up auto-sweep");
    console.error("[savings-sweep-setup]", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
