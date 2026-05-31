import { NextRequest, NextResponse } from "next/server";
import { getUserWallets } from "@/lib/circle";
import { assignSlug, getUserByEmail, saveUser } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const { userToken, email } = await req.json();
    if (!userToken || !email) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Return existing registration if already saved (idempotent)
    const existing = getUserByEmail(normalizedEmail);
    if (existing) {
      return NextResponse.json({
        slug: existing.slug,
        walletAddress: existing.walletAddress,
      });
    }

    const wallets = await getUserWallets(userToken);
    const wallet = wallets[0];
    if (!wallet) {
      return NextResponse.json(
        { error: "No wallet found. Try again in a moment." },
        { status: 404 }
      );
    }

    const slug = assignSlug(normalizedEmail);
    saveUser({
      email: normalizedEmail,
      slug,
      walletId: wallet.id,
      walletAddress: wallet.address,
    });

    return NextResponse.json({ slug, walletAddress: wallet.address });
  } catch (err) {
    console.error("[complete]", err);
    return NextResponse.json(
      { error: "Failed to complete setup" },
      { status: 500 }
    );
  }
}
