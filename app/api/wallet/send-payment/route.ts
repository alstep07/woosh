import { NextRequest, NextResponse } from "next/server";
import { createPaymentChallenge, getUserWallets } from "@/shared/lib/circle";

export async function POST(req: NextRequest) {
  try {
    const { userToken, recipientAddress, amount } = await req.json();
    if (!userToken || !recipientAddress || !amount) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
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
      amount
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("[send-payment]", err);
    return NextResponse.json(
      { error: "Failed to create payment" },
      { status: 500 }
    );
  }
}
