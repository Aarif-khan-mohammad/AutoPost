import { NextRequest, NextResponse } from "next/server";

const NGROK = { "ngrok-skip-browser-warning": "true", "User-Agent": "AutoPost-Server/1.0" };

export async function POST(req: NextRequest) {
  const B = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");
  if (!B) return NextResponse.json({ detail: "BACKEND_URL not configured" }, { status: 503 });
  try {
    const body = await req.json();
    const res  = await fetch(`${B}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...NGROK },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json({ detail: `Backend error: ${text.slice(0, 200)}` }, { status: 502 });
    }
  } catch (e: unknown) {
    return NextResponse.json({ detail: `Proxy error: ${e}` }, { status: 502 });
  }
}
