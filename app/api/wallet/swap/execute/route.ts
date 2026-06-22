import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "viem";
import { getUserWallets } from "@/shared/lib/circle";
import { canSwapPair, executePair, type SwapSym } from "@/shared/lib/swap";
import { getExecutorAddress, dcwTransfer } from "@/shared/lib/dcw";
import { tokenBySymbol } from "@/shared/lib/tokens";
import { arcPublicClient } from "@/shared/lib/arc";

/**
 * Manual swap, step 2 of 2. The user has funded the executor with `tokenIn` (step 1's PIN
 * transfer). The executor now swaps it (App Kit, else Synthra) and delivers the output token
 * to the user's OWN wallet (output is locked to the authenticated user). On any failure after
 * the funds are in hand, the input is refunded so nothing gets stuck.
 *
 * Trust note (testnet): we sanity-check the executor holds enough of tokenIn, but can't
 * statelessly prove this exact user funded it. Output going only to the authenticated user +
 * small testnet float keeps the blast radius tiny; verifying the funding tx is the pre-mainnet
 * hardening step.
 */
const TOKENS = new Set(["USDC", "EURC", "cirBTC"]);
function validPair(tokenIn?: string, tokenOut?: string): boolean {
  if (!tokenIn || !tokenOut || tokenIn === tokenOut) return false;
  if (!TOKENS.has(tokenIn) || !TOKENS.has(tokenOut)) return false;
  return tokenIn === "USDC" || tokenOut === "USDC";
}

const ERC20_BALANCE_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

// How much of tokenIn does the executor hold? Native USDC is 18-dec via getBalance; an ERC-20
// token uses its own decimals via balanceOf. Returns the base-unit balance.
async function executorBalance(tokenIn: SwapSym, executor: `0x${string}`): Promise<bigint> {
  if (tokenIn === "USDC") return arcPublicClient.getBalance({ address: executor });
  const addr = tokenBySymbol(tokenIn)!.address!;
  return arcPublicClient.readContract({ address: addr, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [executor] }) as Promise<bigint>;
}

function fundedDecimals(tokenIn: SwapSym): number {
  // Native USDC value is 18-dec; ERC-20 tokens use their own.
  return tokenIn === "USDC" ? 18 : tokenBySymbol(tokenIn)!.decimals;
}

async function refund(tokenIn: SwapSym, owner: string, amount: string) {
  const tokenAddr = tokenIn === "USDC" ? "" : tokenBySymbol(tokenIn)!.address!;
  await dcwTransfer(owner, amount, tokenAddr).catch(() => {});
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

    const wallets = await getUserWallets(userToken);
    const owner = wallets[0]?.address;
    if (!owner) {
      return NextResponse.json({ error: "No Woosh wallet found." }, { status: 404 });
    }

    const executor = getExecutorAddress();
    const inSym = tokenIn as SwapSym;
    const outSym = tokenOut as SwapSym;

    // Confirm the executor actually holds the funds before swapping. No refund on this path —
    // nothing extra was taken, and it blocks a swap when the funding transfer hasn't landed.
    const have = await executorBalance(inSym, executor);
    if (have < parseUnits(String(amount), fundedDecimals(inSym))) {
      return NextResponse.json(
        { error: "Funds not received yet. Please retry in a moment." },
        { status: 409 }
      );
    }

    // Route could have dried up between funding and now — refund if so.
    const route = await canSwapPair(inSym, outSym, String(amount), executor);
    if (!route.ok) {
      await refund(inSym, owner, String(amount));
      return NextResponse.json(
        { error: `No swap route available; your ${inSym} was refunded.` },
        { status: 409 }
      );
    }

    try {
      const out = await executePair(inSym, outSym, String(amount), executor, owner as `0x${string}`);
      return NextResponse.json({ ok: true, amountOut: out.amountOut ?? null, tokenOut: outSym });
    } catch (err) {
      await refund(inSym, owner, String(amount));
      const msg = err instanceof Error ? err.message : `Swap failed; your ${inSym} was refunded.`;
      console.error("[swap/execute]", msg, err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Swap failed";
    console.error("[swap/execute]", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
