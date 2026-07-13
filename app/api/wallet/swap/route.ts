import { NextRequest, NextResponse } from "next/server";
import { createPaymentChallenge, createTokenTransferChallenge, getUserWallets } from "@/shared/lib/circle";
import { canSwapPair, type SwapSym } from "@/shared/lib/swap";
import { getExecutorAddress } from "@/shared/lib/dcw";
import { tokenBySymbol } from "@/shared/lib/tokens";

/**
 * Manual swap, step 1 of 2. App Kit can only sign via the executor (DCW), never the user's UCW
 * wallet, so a user swap goes: user sends `tokenIn` to the executor (this PIN challenge) ->
 * executor swaps + sends the output back (POST /api/wallet/swap/execute). USDC funds natively;
 * a token (EURC/cirBTC, for reverse swaps) funds as an ERC-20 transfer.
 */
const TOKENS = new Set(["USDC", "EURC", "cirBTC"]);
function validPair(tokenIn?: string, tokenOut?: string): boolean {
  if (!tokenIn || !tokenOut || tokenIn === tokenOut) return false;
  if (!TOKENS.has(tokenIn) || !TOKENS.has(tokenOut)) return false;
  return tokenIn === "USDC" || tokenOut === "USDC";
}

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
  try {
    const { userToken, tokenIn, tokenOut, amount } = await req.json();
    if (!userToken || !validPair(tokenIn, tokenOut)) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }
    if (!/^\d+(\.\d+)?$/.test(String(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // Route check and wallet lookup are independent, run them in parallel to cut the
    // wait before the PIN window appears.
    const [route, wallets] = await Promise.all([
      // Don't ask the user to part with funds unless the swap actually routes right now.
      canSwapPair(tokenIn as SwapSym, tokenOut as SwapSym, String(amount), getExecutorAddress()),
      getUserWallets(userToken),
    ]);
    if (!route.ok) {
      return NextResponse.json(
        { error: "No swap route available right now. Please try again shortly." },
        { status: 409 }
      );
    }

    const wallet = wallets[0];
    if (!wallet) {
      return NextResponse.json({ error: "No Woosh wallet found. Sign up first." }, { status: 404 });
    }

    const executor = getExecutorAddress();
    const result =
      tokenIn === "USDC"
        ? await createPaymentChallenge(userToken, wallet.id, executor, String(amount))
        : await createTokenTransferChallenge(
            userToken,
            wallet.id,
            executor,
            String(amount),
            tokenBySymbol(tokenIn)!.address!
          );
    return NextResponse.json({ ...result, walletId: wallet.id });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Token expired. Please re-authenticate." }, { status: 401 });
    }
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? (err instanceof Error ? err.message : "Failed to start swap");
    console.error("[swap]", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
