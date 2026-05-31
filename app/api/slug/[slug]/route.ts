import { NextRequest, NextResponse } from "next/server";
import { getUserBySlug } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const user = getUserBySlug(params.slug);
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    slug: user.slug,
    walletAddress: user.walletAddress,
    label: user.email.split("@")[0],
  });
}
