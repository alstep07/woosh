import { NextRequest, NextResponse } from "next/server";
import { requestOtp } from "@/shared/lib/circle";

export async function POST(req: NextRequest) {
  try {
    const { deviceId, email } = await req.json();
    if (!deviceId || !email) {
      return NextResponse.json(
        { error: "Missing deviceId or email" },
        { status: 400 }
      );
    }
    const data = await requestOtp(deviceId, email.trim().toLowerCase());
    return NextResponse.json(data);
  } catch (err) {
    console.error("[request-otp]", err);
    return NextResponse.json(
      { error: "Failed to send verification code" },
      { status: 500 }
    );
  }
}
