import { NextRequest, NextResponse } from "next/server";
import { createPaymentChallenge, getUserWallets } from "@/shared/lib/circle";

// Circle error codes / HTTP statuses that indicate an expired or invalid user token.
// Return 401 so ChatPanel's OTP fallback fires instead of showing a generic error.
function isAuthError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  const code = (err as { response?: { data?: { code?: number } } })?.response?.data?.code;
  const msg = ((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "").toLowerCase();
  return (
    status === 401 ||
    code === 90001 || // Circle: invalid/expired user token
    msg.includes("invalid user token") ||
    msg.includes("token expired") ||
    msg.includes("unauthorized")
  );
}

export async function POST(req: NextRequest) {
  try {
    const { userToken, recipientAddress, amount } = await req.json();
    if (!userToken || !recipientAddress || !amount) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (!/^\d+(\.\d+)?$/.test(String(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const wallets = await getUserWallets(userToken);
    const wallet = wallets[0];
    if (!wallet) {
      return NextResponse.json(
        { error: "No Woosh wallet found. Sign up first." },
        { status: 404 }
      );
    }

    const result = await createPaymentChallenge(
      userToken,
      wallet.id,
      recipientAddress,
      String(amount)
    );
    return NextResponse.json({ ...result, walletId: wallet.id });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Token expired. Please re-authenticate." }, { status: 401 });
    }
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? (err instanceof Error ? err.message : "Failed to create payment");
    console.error("[send-payment]", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
