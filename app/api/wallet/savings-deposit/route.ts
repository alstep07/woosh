import { NextRequest, NextResponse } from "next/server";
import { createSavingsDepositChallenge, getUserWallets } from "@/shared/lib/circle";

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

export async function POST(req: NextRequest) {
  const vault = process.env.NEXT_PUBLIC_SAVINGS_VAULT_ADDRESS as `0x${string}` | undefined;
  if (!vault) {
    return NextResponse.json({ error: "Savings vault not configured" }, { status: 400 });
  }

  try {
    const { userToken, amount } = await req.json();
    if (!userToken || !amount) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!/^\d+(\.\d+)?$/.test(String(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const wallets = await getUserWallets(userToken);
    const wallet = wallets[0];
    if (!wallet) {
      return NextResponse.json({ error: "No Woosh wallet found." }, { status: 404 });
    }

    const result = await createSavingsDepositChallenge(userToken, wallet.id, vault, String(amount));
    return NextResponse.json({ ...result, walletId: wallet.id });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Token expired. Please re-authenticate." }, { status: 401 });
    }
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? (err instanceof Error ? err.message : "Failed to deposit into savings");
    console.error("[savings-deposit]", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
