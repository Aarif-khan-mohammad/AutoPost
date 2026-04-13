import { NextResponse } from "next/server";
const B = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const res = await fetch(`${B}/api/jobs?limit=10`, {
    headers: { Authorization: auth, "ngrok-skip-browser-warning": "1" },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
