import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  if (!password) return NextResponse.json({ detail: "Password required" }, { status: 400 });

  // Get session from Authorization header (sent by client after setSession)
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Update password in Supabase Auth
  const { data, error } = token
    ? await createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      ).auth.updateUser({ password })
    : await supabase.auth.updateUser({ password });

  if (error) return NextResponse.json({ detail: error.message }, { status: 400 });

  // Also update hashed password in our custom users table
  if (data?.user?.email) {
    const BACKEND_URL = (process.env.BACKEND_URL as string ?? "").replace(/\/$/, "");
    if (BACKEND_URL) {
      await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: data.user.email, token: "supabase", password }),
      }).catch(() => {}); // non-fatal
    }
  }

  return NextResponse.json({ message: "Password updated" });
}
