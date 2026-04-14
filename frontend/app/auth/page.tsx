"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiLogin, apiSignup } from "@/lib/auth";
import { useAuth } from "@/lib/AuthContext";

export default function AuthPage() {
  const [mode, setMode]       = useState<"login" | "signup">("login");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const { login }             = useAuth();
  const router                = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const data = mode === "login"
        ? await apiLogin(email, password)
        : await apiSignup(email, password);

      login(data.token, {
        user_id:    data.user_id,
        email:      data.email,
        role:       data.role,
        post_count: data.post_count ?? 0,
        can_post:   data.role === "admin" || (data.post_count ?? 0) < 1,
      });
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">AutoPost</h1>
          <p className="mt-2 text-zinc-400 text-sm">AI-powered YouTube Shorts automation</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-6 space-y-5">
          {/* Tabs */}
          <div className="flex gap-1 bg-zinc-950 rounded-xl p-1">
            {(["login", "signup"] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all capitalize ${
                  mode === m ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}>
                {m === "login" ? "🔑 Login" : "✨ Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Email</label>
              <input required type="email" placeholder="you@example.com"
                value={email} onChange={e => setEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Password</label>
              <input required type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}

            {mode === "login" && (
              <div className="text-right">
                <a href="/forgot-password" className="text-xs text-indigo-400 hover:underline">
                  Forgot password?
                </a>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold hover:bg-indigo-500 active:scale-95 disabled:opacity-40 transition-all">
              {loading ? "Please wait…" : mode === "login" ? "🔑 Login" : "✨ Create Account"}
            </button>
          </form>

          {mode === "signup" && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 space-y-1">
              <p className="text-xs text-amber-400 font-semibold">Free Account Limits</p>
              <p className="text-xs text-zinc-400">• 1 successful post (YouTube <span className="text-zinc-500">or</span> Instagram)</p>
              <p className="text-xs text-zinc-400">• Contact admin to upgrade to unlimited</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
