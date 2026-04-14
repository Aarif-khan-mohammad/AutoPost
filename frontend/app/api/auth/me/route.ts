import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const B = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");
  if (!B) return NextResponse.json({ detail: "BACKEND_URL not configured" }, { status: 503 });
  try {
    const auth = req.headers.get("authorization") ?? "";
    const res  = await fetch(`${B}/api/auth/me`, {
      headers: { Authorization: auth, "ngrok-skip-browser-warning": "1" },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    return NextResponse.json({ detail: `Proxy error: ${e}` }, { status: 502 });
  }
}
