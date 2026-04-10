import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL as string;

export async function GET() {
  if (!BACKEND_URL) return NextResponse.json({ channel: "", times: "", timezone: "", jobs: [] });
  const res = await fetch(`${BACKEND_URL}/api/schedule`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  if (!BACKEND_URL) return NextResponse.json({ error: "BACKEND_URL not set" }, { status: 503 });
  const body = await req.json();
  const res = await fetch(`${BACKEND_URL}/api/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
