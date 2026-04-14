import { NextRequest, NextResponse } from "next/server";
const B = (process.env.BACKEND_URL as string).replace(/\/$/, "");
export async function POST(req: NextRequest) {
  const body = await req.json();
  const res  = await fetch(`${B}/api/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
