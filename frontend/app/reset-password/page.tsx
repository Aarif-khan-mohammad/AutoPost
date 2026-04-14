"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiResetPassword } from "@/lib/auth";

function ResetForm() {
  const params              = useSearchParams();
  const [email, setEmail]   = useState("");
  const [token, setToken]   = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (params.get("email")) setEmail(params.get("email")!);
    if (params.get("token")) setToken(params.get("token")!);
  }, [params]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    setError("");
    try {
      await apiResetPassword(email, token, password);
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Reset Password</h1>
          <p className="text-zinc-400 text-sm mt-1">Enter the code from your email and your new password</p>
        </div>

        {done ? (
          <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 text-center space-y-2">
            <p className="text-green-400 font-semibold">✅ Password updated!</p>
            <a href="/auth" className="text-indigo-400 text-sm underline block">→ Back to login</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-zinc-700 bg-zinc-900/60 p-6">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Email address</label>
              <input required type="email" placeholder="you@example.com"
                value={email} onChange={e => setEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Reset code (from email)</label>
              <input required type="text" placeholder="Paste your reset code here"
                value={token} onChange={e => setToken(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">New password</label>
              <input required type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Confirm new password</label>
              <input required type="password" placeholder="••••••••"
                value={confirm} onChange={e => setConfirm(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {error && <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold hover:bg-indigo-500 disabled:opacity-40 transition-all">
              {loading ? "Updating…" : "Update Password"}
            </button>
            <p className="text-center text-xs text-zinc-600">
              <a href="/auth" className="text-indigo-400 hover:underline">← Back to login</a>
            </p>
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
