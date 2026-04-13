import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = (process.env.BACKEND_URL as string).replace(/\/$/, "");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  const { job_id } = await params;
  const auth = req.headers.get("authorization") ?? "";
  const res = await fetch(`${BACKEND_URL}/api/jobs/${job_id}`, {
    headers: { Authorization: auth, "ngrok-skip-browser-warning": "1" },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
