import { NextRequest, NextResponse } from "next/server";
import { getUserWallets } from "@/lib/circle";

export async function POST(req: NextRequest) {
  try {
    const { userToken } = await req.json();
    if (!userToken) {
      return NextResponse.json({ error: "Missing userToken" }, { status: 400 });
    }

    const wallets = await getUserWallets(userToken);
    const wallet = wallets[0];
    if (!wallet) {
      return NextResponse.json(
        { error: "No wallet found. Try again in a moment." },
        { status: 404 }
      );
    }

    return NextResponse.json({ walletAddress: wallet.address });
  } catch (err) {
    console.error("[complete]", err);
    return NextResponse.json(
      { error: "Failed to complete setup" },
      { status: 500 }
    );
  }
}
