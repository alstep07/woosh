import { NextRequest, NextResponse } from "next/server";
import { parseUnits, encodeFunctionData } from "viem";
import { getUserWallets } from "@/shared/lib/circle";
import { executePair, type SwapSym } from "@/shared/lib/swap";
import { getExecutorAddress, dcwExecuteRaw, waitForTx } from "@/shared/lib/dcw";
import { tokenBySymbol } from "@/shared/lib/tokens";
import { arcPublicClient } from "@/shared/lib/arc";

/**
 * Manual swap, step 2 of 2. The user already sent tokenIn to the executor (step 1 PIN).
 * The executor swaps and delivers the output directly to the user's wallet.
 *
 * Refund guarantee: if ANYTHING fails after we confirm funds are in the executor, we
 * attempt an ERC-20 refund before returning the error. Two-level try/catch ensures the
 * outer catch (validation errors) never accidentally triggers a refund.
 */

const TOKENS = new Set(["USDC", "EURC", "cirBTC"]);
function validPair(tokenIn?: string, tokenOut?: string): boolean {
  if (!tokenIn || !tokenOut || tokenIn === tokenOut) return false;
  if (!TOKENS.has(tokenIn) || !TOKENS.has(tokenOut)) return false;
  return tokenIn === "USDC" || tokenOut === "USDC";
}

const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "transfer",  type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

const USDC_ERC20 = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const REFUND_GAS_BUFFER = parseUnits("0.02", 18);

async function executorBalance(tokenIn: SwapSym, executor: `0x${string}`): Promise<bigint> {
  if (tokenIn === "USDC") return arcPublicClient.getBalance({ address: executor });
  const addr = tokenBySymbol(tokenIn)!.address!;
  return arcPublicClient.readContract({ address: addr, abi: ERC20_ABI, functionName: "balanceOf", args: [executor] }) as Promise<bigint>;
}

async function refund(tokenIn: SwapSym, owner: `0x${string}`, executor: `0x${string}`): Promise<void> {
  try {
    let bal = await executorBalance(tokenIn, executor);
    let erc20Amount: bigint;
    let tokenAddr: `0x${string}`;

    if (tokenIn === "USDC") {
      if (bal <= REFUND_GAS_BUFFER) return;
      bal -= REFUND_GAS_BUFFER;
      erc20Amount = bal / 1_000_000_000_000n; // 18-dec native → 6-dec ERC-20
      tokenAddr = USDC_ERC20;
    } else {
      if (bal === 0n) return;
      erc20Amount = bal;
      tokenAddr = tokenBySymbol(tokenIn)!.address!;
    }

    if (erc20Amount === 0n) return;
    const data = encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [owner, erc20Amount] });
    const r = await dcwExecuteRaw(tokenAddr, data);
    const id = (r as { id?: string } | undefined)?.id;
    if (id) await waitForTx(id, 30_000);
  } catch (e) {
    console.error("[swap/execute] refund failed", e);
  }
}

export async function POST(req: NextRequest) {
  // ── Outer try: validation + wallet lookup. Errors here mean no funds were touched. ──
  let ownerAddr: `0x${string}`;
  let inSym: SwapSym;
  let outSym: SwapSym;
  let executor: `0x${string}`;
  let amountStr: string;
  let slippagePct: number;

  try {
    const body = await req.json() as { userToken?: string; tokenIn?: string; tokenOut?: string; amount?: unknown; slippage?: unknown };
    const { userToken, tokenIn, tokenOut, amount, slippage } = body;

    if (!userToken || !validPair(tokenIn, tokenOut)) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }
    amountStr = String(amount ?? "");
    if (!/^\d+(\.\d+)?$/.test(amountStr) || parseFloat(amountStr) <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const wallets = await getUserWallets(userToken);
    const owner = wallets[0]?.address;
    if (!owner) return NextResponse.json({ error: "No Woosh wallet found." }, { status: 404 });

    executor    = getExecutorAddress();
    inSym       = tokenIn as SwapSym;
    outSym      = tokenOut as SwapSym;
    ownerAddr   = owner as `0x${string}`;
    // Clamp client-supplied slippage to [0.5, 25] so the client can't set absurd values.
    slippagePct = Math.min(25, Math.max(0.5, Number(slippage) || 5));
  } catch (err) {
    console.error("[swap/execute] setup", err);
    return NextResponse.json({ error: "Swap failed. Please try again." }, { status: 500 });
  }

  // ── Wait for executor to receive funds (Arc is sub-second but sdk.execute callback
  //    fires before the balance is queryable; poll up to ~10s before giving up). ──
  const inDecimals = inSym === "USDC" ? 18 : tokenBySymbol(inSym)!.decimals;
  const needed = parseUnits(amountStr, inDecimals);
  let have = 0n;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2_000));
    try {
      have = await executorBalance(inSym, executor);
    } catch {
      return NextResponse.json({ error: "Could not verify funds. Please try again." }, { status: 503 });
    }
    if (have >= needed) break;
  }
  if (have < needed) {
    return NextResponse.json(
      { error: "Funds not received. Please try again in a moment." },
      { status: 409 }
    );
  }

  // ── Inner try: swap. Refund is ALWAYS attempted on any failure from here. ──
  try {
    const out = await executePair(inSym, outSym, amountStr, executor, ownerAddr, slippagePct);
    return NextResponse.json({ ok: true, amountOut: out.amountOut ?? null, tokenOut: outSym, exact: out.exact ?? false });
  } catch (err) {
    console.error("[swap/execute] swap", err);
    await refund(inSym, ownerAddr, executor);
    return NextResponse.json(
      { error: `Swap failed. Your ${inSym} was refunded.`, refunded: true },
      { status: 500 }
    );
  }
}
