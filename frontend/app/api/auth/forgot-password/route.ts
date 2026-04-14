import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ detail: "Email required" }, { status: 400 });

  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://auto-post-kohl.vercel.app"}/reset-password`,
  });

  if (error) return NextResponse.json({ detail: error.message }, { status: 400 });
  return NextResponse.json({ message: "Reset link sent" });
}
