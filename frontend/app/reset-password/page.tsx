"use client";

import { useState, useEffect, Suspense } from "react";
import { createClient } from "@supabase/supabase-js";

function ResetForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [ready, setReady]       = useState(false);

  useEffect(() => {
    // Supabase puts the session tokens in the URL hash after redirect
    // We need to exchange them for a session
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const hash = window.location.hash;
    if (hash) {
      // Parse access_token and refresh_token from hash
      const params = new URLSearchParams(hash.substring(1));
      const access_token  = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (access_token && refresh_token) {
        supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
          if (error) setError("Invalid or expired reset link. Please request a new one.");
          else setReady(true);
        });
      } else {
        setError("Invalid reset link. Please request a new one.");
      }
    } else {
      setError("Invalid reset link. Please request a new one.");
    }
  }, []);

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

    // Also update in our custom users table via backend
    const res = await fetch("/api/auth/reset-password", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ password }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.detail ?? "Reset failed");
    } else {
      setDone(true);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Set New Password</h1>
          <p className="text-zinc-400 text-sm mt-1">Choose a strong new password</p>
        </div>

        {done ? (
          <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-5 text-center space-y-2">
            <p className="text-green-400 font-semibold text-lg">✅ Password updated!</p>
            <p className="text-zinc-400 text-sm">You can now log in with your new password.</p>
            <a href="/auth" className="block mt-2 text-indigo-400 text-sm underline">→ Go to login</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-zinc-700 bg-zinc-900/60 p-6">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">New password</label>
              <input required type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                disabled={!ready}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Confirm new password</label>
              <input required type="password" placeholder="••••••••"
                value={confirm} onChange={e => setConfirm(e.target.value)}
                disabled={!ready}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40"
              />
            </div>
            {error && (
              <div className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2 space-y-1">
                <p>{error}</p>
                {error.includes("expired") && (
                  <a href="/forgot-password" className="text-indigo-400 underline">Request a new reset link →</a>
                )}
              </div>
            )}
            <button type="submit" disabled={loading || !ready}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold hover:bg-indigo-500 disabled:opacity-40 transition-all">
              {loading ? "Updating…" : ready ? "Update Password" : "Verifying link…"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <ResetForm />
    </Suspense>
  );
}
