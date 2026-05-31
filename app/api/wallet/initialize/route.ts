import { NextRequest, NextResponse } from "next/server";
import { initializeUser } from "@/lib/circle";

export async function POST(req: NextRequest) {
  try {
    const { userToken } = await req.json();
    if (!userToken) {
      return NextResponse.json({ error: "Missing userToken" }, { status: 400 });
    }
    const result = await initializeUser(userToken);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[initialize]", err);
    return NextResponse.json(
      { error: "Failed to initialize wallet" },
      { status: 500 }
    );
  }
}
