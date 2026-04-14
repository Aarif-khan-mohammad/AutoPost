import { NextRequest, NextResponse } from "next/server";

const NGROK = { "ngrok-skip-browser-warning": "true", "User-Agent": "AutoPost-Server/1.0" };
const B = () => (process.env.BACKEND_URL ?? "").replace(/\/$/, "");

export async function POST(req: NextRequest) {
  const base = B();
  if (!base) return NextResponse.json({ detail: "BACKEND_URL not configured" }, { status: 503 });
  try {
    const auth = req.headers.get("authorization") ?? "";
    const body = await req.json();
    const res  = await fetch(`${base}/api/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth, ...NGROK },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    try { return NextResponse.json(JSON.parse(text), { status: res.status }); }
    catch { return NextResponse.json({ detail: text.slice(0, 200) }, { status: 502 }); }
  } catch (e: unknown) {
    return NextResponse.json({ detail: `Proxy error: ${e}` }, { status: 502 });
  }
}
