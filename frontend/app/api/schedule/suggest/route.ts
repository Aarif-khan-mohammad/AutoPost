import { NextRequest, NextResponse } from "next/server";
const B = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(req: NextRequest) {
  const tz  = req.nextUrl.searchParams.get("timezone") ?? "Asia/Kolkata";
  const res = await fetch(`${B}/api/schedule/suggest?timezone=${encodeURIComponent(tz)}`, {
    headers: { "ngrok-skip-browser-warning": "1" },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
