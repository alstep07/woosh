import { NextRequest, NextResponse } from "next/server";
import { createSweepApproveChallenge, getUserWallets } from "@/shared/lib/circle";

/**
 * Challenge for the ONE-TIME allowance a Sweep portfolio needs: approve the strategy
 * registry on the USDC ERC-20 precompile. The registry bounds every pull on-chain
 * (owner-set threshold + per-period cap, executor-only), and the owner can revoke by
 * approving 0 at any time. Executed via the standard challenge/execute PIN flow.
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
  const registry = process.env.NEXT_PUBLIC_STRATEGY_REGISTRY_ADDRESS as `0x${string}` | undefined;
  if (!registry) {
    return NextResponse.json({ error: "Strategy registry not configured" }, { status: 400 });
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

    const result = await createSweepApproveChallenge(userToken, wallet.id, registry);
    return NextResponse.json({ ...result, walletId: wallet.id });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Token expired. Please re-authenticate." }, { status: 401 });
    }
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? (err instanceof Error ? err.message : "Failed to create approval");
    console.error("[approve-sweep]", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
