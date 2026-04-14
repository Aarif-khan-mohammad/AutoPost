"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

export default function ResetPassword() {
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    setError("");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) setError(error.message);
    else setDone(true);
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Reset Password</h1>
          <p className="text-zinc-400 text-sm mt-1">Enter your new password</p>
        </div>

        {done ? (
          <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 text-center">
            <p className="text-green-400 font-semibold">✅ Password updated!</p>
            <a href="/login" className="text-indigo-400 text-sm underline mt-2 block">Back to login</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              required type="password" placeholder="New password"
              value={password} onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              required type="password" placeholder="Confirm new password"
              value={confirm} onChange={e => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold hover:bg-indigo-500 disabled:opacity-40 transition-all">
              {loading ? "Updating…" : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
