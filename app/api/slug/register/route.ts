import { NextRequest, NextResponse } from "next/server";
import { getUserWallets, createSlugRegistrationChallenge } from "@/shared/lib/circle";
import { validateSlug } from "@/entities/slug/lib/validateSlug";

export async function POST(req: NextRequest) {
  const registryAddress = process.env.NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS as `0x${string}` | undefined;
  if (!registryAddress) {
    console.error("[api/slug/register] NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS is not set");
    return NextResponse.json({ error: "Slug registry not configured" }, { status: 400 });
  }

  let body: { userToken?: string; slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { userToken, slug } = body;
  if (!userToken || !slug) {
    return NextResponse.json({ error: "userToken and slug are required" }, { status: 400 });
  }
  if (!validateSlug(slug)) {
    return NextResponse.json({ error: "Invalid slug format" }, { status: 400 });
  }

  try {
    console.log("[api/slug/register] Fetching wallets for user...");
    const wallets = await getUserWallets(userToken);
    console.log("[api/slug/register] Found", wallets.length, "wallet(s)");

    const wallet = wallets[0];
    if (!wallet) {
      console.error("[api/slug/register] No wallets found for userToken");
      return NextResponse.json({ error: "No wallet found for user" }, { status: 400 });
    }
    console.log("[api/slug/register] Using wallet id:", wallet.id, "address:", wallet.address);

    console.log("[api/slug/register] Creating contract execution challenge for slug:", slug);
    const { challengeId } = await createSlugRegistrationChallenge(
      userToken,
      wallet.id,
      registryAddress,
      slug
    );
    console.log("[api/slug/register] Challenge created:", challengeId);

    return NextResponse.json({ challengeId });
  } catch (err) {
    console.error("[api/slug/register] Error:", err);
    const message = err instanceof Error ? err.message : "Failed to create registration challenge";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
