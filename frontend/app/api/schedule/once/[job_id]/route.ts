import { NextRequest, NextResponse } from "next/server";
const B = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  const { job_id } = await params;
  const res = await fetch(`${B}/api/schedule/once/${job_id}`, { method: "DELETE" });
  return NextResponse.json(await res.json(), { status: res.status });
}
