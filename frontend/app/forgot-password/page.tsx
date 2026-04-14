"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ForgotPassword() {
  const [email, setEmail]   = useState("");
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Forgot Password</h1>
          <p className="text-zinc-400 text-sm mt-1">We'll send a reset link to your email</p>
        </div>

        {sent ? (
          <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 text-center">
            <p className="text-green-400 font-semibold">✅ Reset link sent!</p>
            <p className="text-zinc-400 text-sm mt-1">Check your email and click the link to reset your password.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              required type="email" placeholder="your@email.com"
              value={email} onChange={e => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold hover:bg-indigo-500 disabled:opacity-40 transition-all">
              {loading ? "Sending…" : "Send Reset Link"}
            </button>
            <p className="text-center text-xs text-zinc-600">
              <a href="/login" className="text-indigo-400 hover:underline">Back to login</a>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
