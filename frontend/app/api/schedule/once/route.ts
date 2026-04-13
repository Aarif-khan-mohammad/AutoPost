import { NextRequest, NextResponse } from "next/server";
const B = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  const res = await fetch(`${B}/api/schedule/once`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await req.json()),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
