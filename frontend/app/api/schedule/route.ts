import { NextRequest, NextResponse } from "next/server";
const B = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const res = await fetch(`${B}/api/schedule`, {
    headers: { Authorization: auth, "ngrok-skip-browser-warning": "1" },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const res = await fetch(`${B}/api/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth, "ngrok-skip-browser-warning": "1" },
    body: JSON.stringify(await req.json()),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
