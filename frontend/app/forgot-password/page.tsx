"use client";

import { useState } from "react";
import { apiForgotPassword } from "@/lib/auth";

export default function ForgotPassword() {
  const [email, setEmail]     = useState("");
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiForgotPassword(email);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Forgot Password</h1>
          <p className="text-zinc-400 text-sm mt-1">Enter your email — we'll send a reset code</p>
        </div>

        {sent ? (
          <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 text-center space-y-2">
            <p className="text-green-400 font-semibold">✅ Reset code sent!</p>
            <p className="text-zinc-400 text-sm">Check your email for the reset code, then use it below.</p>
            <a href={`/reset-password?email=${encodeURIComponent(email)}`}
              className="block mt-2 text-indigo-400 text-sm underline">
              → Go to Reset Password
            </a>
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
            {error && <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold hover:bg-indigo-500 disabled:opacity-40 transition-all">
              {loading ? "Sending…" : "Send Reset Code"}
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
