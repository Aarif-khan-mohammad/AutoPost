import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = (process.env.BACKEND_URL as string).replace(/\/$/, "");

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const body = await req.json();
  const res = await fetch(`${BACKEND_URL}/api/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth, "ngrok-skip-browser-warning": "1" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
