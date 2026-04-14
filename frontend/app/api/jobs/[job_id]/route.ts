import { NextRequest, NextResponse } from "next/server";

const NGROK = { "ngrok-skip-browser-warning": "true", "User-Agent": "AutoPost-Server/1.0" };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  const B = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");
  if (!B) return NextResponse.json({ detail: "BACKEND_URL not configured" }, { status: 503 });
  try {
    const { job_id } = await params;
    const auth = req.headers.get("authorization") ?? "";
    const res  = await fetch(`${B}/api/jobs/${job_id}`, {
      headers: { Authorization: auth, ...NGROK },
    });
    const text = await res.text();
    try { return NextResponse.json(JSON.parse(text), { status: res.status }); }
    catch { return NextResponse.json({ detail: text.slice(0, 200) }, { status: 502 }); }
  } catch (e: unknown) {
    return NextResponse.json({ detail: `Proxy error: ${e}` }, { status: 502 });
  }
}
