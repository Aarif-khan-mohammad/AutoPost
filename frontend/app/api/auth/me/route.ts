import { NextRequest, NextResponse } from "next/server";
const B = (process.env.BACKEND_URL as string).replace(/\/$/, "");
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const res  = await fetch(`${B}/api/auth/me`, { headers: { Authorization: auth } });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
