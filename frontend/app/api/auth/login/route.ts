import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const B = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");
  if (!B) return NextResponse.json({ detail: "BACKEND_URL not set in Vercel environment variables" }, { status: 503 });
  try {
    const body = await req.json();
    const res  = await fetch(`${B}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    return NextResponse.json({ detail: `Proxy error: ${e}` }, { status: 502 });
  }
}
