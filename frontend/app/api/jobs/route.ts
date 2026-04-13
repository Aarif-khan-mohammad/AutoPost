import { NextResponse } from "next/server";
const B = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET() {
  const res = await fetch(`${B}/api/jobs?limit=10`);
  return NextResponse.json(await res.json(), { status: res.status });
}
