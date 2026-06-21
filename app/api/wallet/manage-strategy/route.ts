import { NextRequest, NextResponse } from "next/server";
import { createStrategyActionChallenge, getUserWallets } from "@/shared/lib/circle";

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

const ID_RE = /^0x[a-fA-F0-9]{64}$/;
const ACTIONS = new Set(["pause", "resume", "cancel"]);

export async function POST(req: NextRequest) {
  const registry = process.env.NEXT_PUBLIC_STRATEGY_REGISTRY_ADDRESS as `0x${string}` | undefined;
  if (!registry) {
    return NextResponse.json({ error: "Strategy registry not configured" }, { status: 400 });
  }

  try {
    const { userToken, id, action } = await req.json();
    if (!userToken || !id || !action) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!ID_RE.test(String(id))) {
      return NextResponse.json({ error: "Invalid strategy id" }, { status: 400 });
    }
    if (!ACTIONS.has(String(action))) {
      return NextResponse.json({ error: "action must be pause, resume or cancel" }, { status: 400 });
    }

    const wallets = await getUserWallets(userToken);
    const wallet = wallets[0];
    if (!wallet) {
      return NextResponse.json({ error: "No Woosh wallet found." }, { status: 404 });
    }

    const result = await createStrategyActionChallenge(
      userToken,
      wallet.id,
      registry,
      action as "pause" | "resume" | "cancel",
      String(id)
    );
    return NextResponse.json({ ...result, walletId: wallet.id });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Token expired. Please re-authenticate." }, { status: 401 });
    }
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? (err instanceof Error ? err.message : "Failed to manage strategy");
    console.error("[manage-strategy]", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
