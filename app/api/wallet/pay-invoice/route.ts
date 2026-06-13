import { NextRequest, NextResponse } from "next/server";
import { createInvoicePayChallenge, getUserWallets } from "@/shared/lib/circle";

// Mirror /api/wallet/send-payment: map expired/invalid Circle tokens to 401 so the
// client's OTP fallback fires instead of a generic error.
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
  const registry = process.env.NEXT_PUBLIC_INVOICE_REGISTRY_ADDRESS as `0x${string}` | undefined;
  if (!registry) {
    return NextResponse.json({ error: "Invoice registry not configured" }, { status: 400 });
  }

  try {
    const { userToken, payee, amount, nonce } = await req.json();
    if (!userToken || !payee || !amount || !nonce) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(payee)) {
      return NextResponse.json({ error: "Invalid payee" }, { status: 400 });
    }
    if (!/^\d+(\.\d+)?$/.test(String(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (!/^\d+$/.test(String(nonce))) {
      return NextResponse.json({ error: "Invalid nonce" }, { status: 400 });
    }

    const wallets = await getUserWallets(userToken);
    const wallet = wallets[0];
    if (!wallet) {
      return NextResponse.json({ error: "No Woosh wallet found. Sign up first." }, { status: 404 });
    }

    const result = await createInvoicePayChallenge(
      userToken,
      wallet.id,
      registry,
      payee,
      String(amount),
      String(nonce)
    );
    return NextResponse.json({ ...result, walletId: wallet.id });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Token expired. Please re-authenticate." }, { status: 401 });
    }
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? (err instanceof Error ? err.message : "Failed to create payment");
    console.error("[pay-invoice]", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
