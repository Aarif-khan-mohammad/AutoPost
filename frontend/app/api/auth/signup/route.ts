import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const B = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");
  if (!B) return NextResponse.json({ detail: "BACKEND_URL not configured" }, { status: 503 });
  try {
    const body = await req.json();
    const res  = await fetch(`${B}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    return NextResponse.json({ detail: `Proxy error: ${e}` }, { status: 502 });
  }
}
