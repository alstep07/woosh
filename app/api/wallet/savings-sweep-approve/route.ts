import { NextRequest, NextResponse } from "next/server";
import { createSweepApproveChallenge, getUserWallets } from "@/shared/lib/circle";

/**
 * Challenge for the ONE-TIME allowance auto-sweep needs: approve the savings vault on
 * the USDC ERC-20 precompile. The vault bounds every pull on-chain (owner-set threshold
 * + per-run cap, executor-only), and the owner can revoke by approving 0 at any time.
 * Same mechanism as /api/wallet/approve-sweep, which targets the strategy registry's
 * Portfolio sweep mode instead, a different contract, hence a separate route.
 */
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
    const { userToken } = await req.json();
    if (!userToken) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const wallets = await getUserWallets(userToken);
    const wallet = wallets[0];
    if (!wallet) {
      return NextResponse.json({ error: "No Woosh wallet found. Sign up first." }, { status: 404 });
    }

    const result = await createSweepApproveChallenge(userToken, wallet.id, vault);
    return NextResponse.json({ ...result, walletId: wallet.id });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Token expired. Please re-authenticate." }, { status: 401 });
    }
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? (err instanceof Error ? err.message : "Failed to create approval");
    console.error("[savings-sweep-approve]", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
