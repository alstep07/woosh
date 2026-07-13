/**
 * Synthra SynRoute API — the swap rail on Arc. SERVER-SIDE ONLY (holds SYNTHRA_API_KEY).
 *
 * On Arc the real route is multi-hop through a Universal Router (e.g. USDC>WUSDC>EURC>cirBTC),
 * so hand-rolling exactInputSingle on a single pool reverts. Instead we ask the API for the
 * routed calldata and execute it from the executor (DCW) via raw contract execution.
 *
 * Flow per the API (approvalMode "erc20", so NO Permit2 signature is needed):
 *   POST /v1/swap -> { approval.tokenApproval.approveTransaction, transaction:{to,data,value} }
 *   1. if needsApproval: execute approveTransaction (ERC-20 approve to the router)
 *   2. execute transaction (the routed swap); output is delivered to `recipient`
 *
 * Reference: synthra-swap/synroute-frontend-template.
 */
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { arcPublicClient } from "@/shared/lib/arc";
import { dcwExecuteRaw, getTxHash, waitForTx } from "@/shared/lib/dcw";

const API_BASE = process.env.SYNTHRA_API_BASE ?? "https://trading-api.synthra.org";
const CHAIN_ID = 5042002;
// Synthra API treats this as a percentage (not true basis points despite the name).
// Testnet: thin liquidity causes >0.5% price impact so 0.5 returns no_route.
// 5 = 5% tolerance — wide enough for testnet fills without being recklessly loose.
const SLIPPAGE_BPS = 5;
const SUCCESS = new Set(["COMPLETE", "CONFIRMED"]);

export type TokenRef = { address: `0x${string}`; decimals: number };

function apiKey(): string {
  const k = process.env.SYNTHRA_API_KEY;
  if (!k) throw new Error("SYNTHRA_API_KEY is not set (Synthra SynRoute API key, required for swaps)");
  return k;
}

/**
 * Format a human token amount cleanly: no scientific notation, up to 8 significant
 * decimal digits, trailing zeros stripped. Values below 0.000001 show as "<0.000001"
 * to avoid confusing micro-amounts like "9.2e-7".
 */
export function fmtOut(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 0.000001) return "<0.000001";
  const fixed = n.toFixed(8).replace(/\.?0+$/, "");
  return fixed;
}

/** Trim a decimal string to at most `decimals` places so parseUnits never throws. */
function truncate(amount: string, decimals: number): string {
  const [int, frac = ""] = amount.split(".");
  if (decimals <= 0) return int;
  const t = frac.slice(0, decimals);
  return t ? `${int}.${t}` : int;
}

function baseUnits(amountHuman: string, t: TokenRef): string {
  return parseUnits(truncate(amountHuman, t.decimals), t.decimals).toString();
}

async function api(path: string, body: unknown, timeoutMs = 25_000): Promise<Record<string, unknown>> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey() },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`synthra ${path} ${res.status}: ${text.slice(0, 240)}`);
    }
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Quote a swap. ok:false = the API couldn't route it. Never throws. */
export async function synrouteQuote(
  tokenIn: TokenRef,
  tokenOut: TokenRef,
  amountInHuman: string
): Promise<{ ok: boolean; estimatedOutput?: string }> {
  try {
    const q = await api("/v1/quote", {
      chainId: CHAIN_ID,
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      amount: baseUnits(amountInHuman, tokenIn),
      tradeType: "EXACT_INPUT",
    });
    if (q.state !== "Success" || !q.amountOutDecimals) return { ok: false };
    return { ok: true, estimatedOutput: fmtOut(Number(q.amountOutDecimals)) };
  } catch {
    return { ok: false };
  }
}

/**
 * Balance of `who` in `token` units. Works for native USDC too: the ERC-20 precompile
 * reports the same balance in 6 decimals, matching refFor()'s TokenRef. null on RPC failure.
 */
async function balanceOf(token: TokenRef, who: `0x${string}`): Promise<bigint | null> {
  try {
    return await arcPublicClient.readContract({
      address: token.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [who],
    });
  } catch {
    return null;
  }
}

/**
 * Exact output delivered to `recipient` by the swap tx: tokenOut balance delta across the
 * tx's block, read from the RPC. Immune both to unrelated transfers landing in the same
 * time window (they sit in other blocks) and to duplicated Transfer events that make
 * log/explorer-based accounting over-count (wrapped-native unwraps on the Synthra route
 * emit the credit twice, which showed users 2x the real output). Returns base units of
 * tokenOut, or null if the tx is not indexed by the RPC yet.
 */
async function outputAtBlock(
  txHash: `0x${string}`,
  tokenOut: TokenRef,
  recipient: `0x${string}`
): Promise<bigint | null> {
  try {
    const receipt = await arcPublicClient.getTransactionReceipt({ hash: txHash });
    if (!receipt || receipt.status !== "success") return null;
    const bal = (blockNumber: bigint) =>
      arcPublicClient.readContract({
        address: tokenOut.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [recipient],
        blockNumber,
      });
    const [pre, post] = await Promise.all([bal(receipt.blockNumber - 1n), bal(receipt.blockNumber)]);
    return post > pre ? post - pre : null;
  } catch {
    return null;
  }
}

type ApproveTx = { to: `0x${string}`; data: `0x${string}` };
type SwapTx = { to: `0x${string}`; data: `0x${string}`; value?: string };

/**
 * Execute a routed swap from `sender` (the executor DCW). Output goes to `recipient`. Approves
 * the router first if needed. Returns ok:false with a `state` describing the failing step.
 */
export async function synrouteSwap(
  tokenIn: TokenRef,
  tokenOut: TokenRef,
  amountInHuman: string,
  recipient: `0x${string}`,
  sender: `0x${string}`,
  slippagePct: number = SLIPPAGE_BPS
): Promise<{ ok: boolean; state: string; amountOut?: string; exact?: boolean }> {
  let built: Record<string, unknown>;
  try {
    built = await api("/v1/swap", {
      chainId: CHAIN_ID,
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      amount: baseUnits(amountInHuman, tokenIn),
      tradeType: "EXACT_INPUT",
      recipient,
      sender,
      approvalMode: "erc20",
      slippageBps: slippagePct,
    });
  } catch {
    return { ok: false, state: "no_route" };
  }
  const tx = built.transaction as SwapTx | undefined;
  if (built.state !== "Success" || !tx?.to || !tx?.data) return { ok: false, state: "no_route" };

  // 1) ERC-20 approve to the router, if the current allowance is insufficient.
  const approval = built.approval as { tokenApproval?: { needsApproval?: boolean; approveTransaction?: ApproveTx } } | undefined;
  const appr = approval?.tokenApproval;
  if (appr?.needsApproval && appr.approveTransaction?.to && appr.approveTransaction?.data) {
    const r = await dcwExecuteRaw(appr.approveTransaction.to, appr.approveTransaction.data);
    const id = (r as { id?: string } | undefined)?.id;
    if (!id) return { ok: false, state: "approve_no_id" };
    const st = await waitForTx(id, 30_000);
    // Timeout or failure: bail out before spending on the swap tx
    if (!SUCCESS.has(st)) return { ok: false, state: `approve_${st}` };
  }

  // 2) Execute the routed swap. value is 0 for token-in swaps (pulled via transferFrom).
  // Snapshot the recipient's tokenOut balance first so we can report the ACTUAL output:
  // built.amountOutDecimals is only the build-time quote and drifts from the fill by up
  // to the slippage tolerance, which made the chat/UI number disagree with tx history.
  const preBalance = await balanceOf(tokenOut, recipient);
  const value = tx.value && tx.value !== "0" ? tx.value : undefined;
  const r2 = await dcwExecuteRaw(tx.to, tx.data, value);
  const id2 = (r2 as { id?: string } | undefined)?.id;
  if (!id2) return { ok: false, state: "swap_no_id" };
  const st2 = await waitForTx(id2, 60_000);
  // Only COMPLETE/CONFIRMED = swap actually landed. Timeout = treat as failure → refund.
  if (!SUCCESS.has(st2)) return { ok: false, state: `swap_${st2}` };

  // Actual received, most exact source first:
  //   1) recipient balance delta across the swap tx's block (exact, pollution-proof),
  //   2) live recipient balance delta (fallback if the tx hash / receipt is unavailable),
  //   3) the build-time quote (drifts from the fill by up to the slippage tolerance).
  let actualOut: string | undefined;
  const txHash = await getTxHash(id2);
  if (txHash) {
    for (let i = 0; i < 3 && !actualOut; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1_500));
      const delta = await outputAtBlock(txHash as `0x${string}`, tokenOut, recipient);
      if (delta !== null && delta > 0n) actualOut = fmtOut(Number(formatUnits(delta, tokenOut.decimals)));
    }
  }
  if (!actualOut && preBalance !== null) {
    for (let i = 0; i < 3; i++) {
      const post = await balanceOf(tokenOut, recipient);
      if (post !== null && post > preBalance) {
        actualOut = fmtOut(Number(formatUnits(post - preBalance, tokenOut.decimals)));
        break;
      }
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }

  // exact=false means the number is the build-time quote, not a measured amount; the UI
  // marks it as approximate so it is never presented as the real fill.
  return {
    ok: true,
    state: st2,
    amountOut: actualOut ?? (built.amountOutDecimals ? fmtOut(Number(built.amountOutDecimals)) : undefined),
    exact: !!actualOut,
  };
}
