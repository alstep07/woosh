import { NextRequest, NextResponse } from "next/server";
import { getUserWallets } from "@/shared/lib/circle";

export async function POST(req: NextRequest) {
  try {
    const { userToken } = await req.json();
    if (!userToken) {
      return NextResponse.json({ error: "Missing userToken" }, { status: 400 });
    }

    // Wallet may not be visible immediately after the PIN challenge completes.
    // Retry up to 5 times with increasing delays to handle Circle propagation lag.
    let wallet: Awaited<ReturnType<typeof getUserWallets>>[number] | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 800 * attempt));
      const wallets = await getUserWallets(userToken);
      wallet = wallets[0];
      if (wallet) break;
    }

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
