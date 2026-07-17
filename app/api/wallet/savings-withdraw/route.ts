import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "viem";
import { createSavingsWithdrawChallenge, getUserWallets } from "@/shared/lib/circle";
import { USDC, EURC, CIRBTC } from "@/shared/lib/tokens";

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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// Vault balance model: token address(0) = native USDC, 18-dec. EURC and cirBTC are
// tracked in their own ERC-20 units. Resolved server-side so the client never sends
// raw base units (no float arithmetic, ever).
function resolveToken(symbol: string): { address: `0x${string}`; decimals: number } | null {
  if (symbol === "USDC") return { address: ZERO_ADDRESS, decimals: USDC.decimals };
  if (symbol === "EURC" && EURC.address) return { address: EURC.address, decimals: EURC.decimals };
  if (symbol === "cirBTC" && CIRBTC.address) return { address: CIRBTC.address, decimals: CIRBTC.decimals };
  return null;
}

export async function POST(req: NextRequest) {
  const vault = process.env.NEXT_PUBLIC_SAVINGS_VAULT_ADDRESS as `0x${string}` | undefined;
  if (!vault) {
    return NextResponse.json({ error: "Savings vault not configured" }, { status: 400 });
  }

  try {
    const { userToken, token, amount } = await req.json();
    if (!userToken || !token || !amount) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!/^\d+(\.\d+)?$/.test(String(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    const resolved = resolveToken(String(token));
    if (!resolved) {
      return NextResponse.json({ error: "Unsupported or unconfigured token" }, { status: 400 });
    }

    const wallets = await getUserWallets(userToken);
    const wallet = wallets[0];
    if (!wallet) {
      return NextResponse.json({ error: "No Woosh wallet found." }, { status: 404 });
    }

    const amountBaseUnits = parseUnits(String(amount), resolved.decimals).toString();
    const result = await createSavingsWithdrawChallenge(
      userToken,
      wallet.id,
      vault,
      resolved.address,
      amountBaseUnits
    );
    return NextResponse.json({ ...result, walletId: wallet.id });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Token expired. Please re-authenticate." }, { status: 401 });
    }
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? (err instanceof Error ? err.message : "Failed to withdraw from savings");
    console.error("[savings-withdraw]", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
