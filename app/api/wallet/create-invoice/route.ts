import { NextRequest, NextResponse } from "next/server";
import { createInvoiceCreateChallenge, getUserWallets } from "@/shared/lib/circle";

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
    const { userToken, salt, amount, memo } = await req.json();
    if (!userToken || !salt || !amount) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!/^\d+$/.test(String(salt))) {
      return NextResponse.json({ error: "Invalid salt" }, { status: 400 });
    }
    if (!/^\d+(\.\d+)?$/.test(String(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const wallets = await getUserWallets(userToken);
    const wallet = wallets[0];
    if (!wallet) {
      return NextResponse.json({ error: "No Woosh wallet found. Sign up first." }, { status: 404 });
    }

    const result = await createInvoiceCreateChallenge(
      userToken,
      wallet.id,
      registry,
      String(salt),
      String(amount),
      typeof memo === "string" ? memo.slice(0, 200) : ""
    );
    return NextResponse.json({ ...result, walletId: wallet.id });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Token expired. Please re-authenticate." }, { status: 401 });
    }
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? (err instanceof Error ? err.message : "Failed to create request");
    console.error("[create-invoice]", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
