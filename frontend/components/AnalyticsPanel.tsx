"use client";

import { useState } from "react";
import { authHeaders } from "@/lib/auth";

type Short = {
  video_id: string;
  title: string;
  url: string;
  views: number;
  likes: number;
  comments: number;
  duration: number;
  published_at: string;
  thumbnail: string;
  action: string;
};

type AnalyticsResult = {
  shorts: Short[];
  kept: number;
  deleted: number;
  threshold: number;
  analysis: string;
  hints_stored: number;
};

export default function AnalyticsPanel() {
  const [result, setResult]   = useState<AnalyticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/analytics/shorts", { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">
            📊 Shorts Performance Monitor
          </h2>
          <p className="text-xs text-zinc-600">
            Checks latest 5 Shorts — deletes under 1K views, gets AI improvement tips
          </p>
        </div>
        <button onClick={run} disabled={loading}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold hover:bg-indigo-500 disabled:opacity-40 transition-all whitespace-nowrap">
          {loading ? "Analyzing…" : "🔍 Run Check"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
      )}

      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3 text-center">
              <p className="text-2xl font-bold text-green-400">{result.kept}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Kept ✅</p>
            </div>
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-center">
              <p className="text-2xl font-bold text-red-400">{result.deleted}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Deleted 🗑️</p>
            </div>
            <div className="rounded-xl bg-zinc-800 border border-zinc-700 p-3 text-center">
              <p className="text-2xl font-bold text-zinc-300">{result.threshold.toLocaleString()}</p>
              <p className="text-xs text-zinc-500 mt-0.5">View threshold</p>
            </div>
          </div>

          {/* Shorts list */}
          <div className="space-y-2">
            {result.shorts.map(s => (
              <div key={s.video_id}
                className={`rounded-xl border p-3 flex items-center gap-3 ${
                  s.action === "kept"
                    ? "border-green-500/30 bg-green-500/5"
                    : s.action === "deleted"
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-zinc-700 bg-zinc-900"
                }`}>
                {s.thumbnail && (
                  <img src={s.thumbnail} alt="" className="w-14 h-10 rounded object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <a href={s.url} target="_blank" rel="noreferrer"
                    className="text-xs font-medium text-zinc-200 hover:text-white truncate block">
                    {s.title}
                  </a>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-zinc-400">👁 {s.views.toLocaleString()}</span>
                    <span className="text-xs text-zinc-600">👍 {s.likes.toLocaleString()}</span>
                    <span className="text-xs text-zinc-600">💬 {s.comments}</span>
                    <span className="text-xs text-zinc-600">{s.duration}s</span>
                  </div>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${
                  s.action === "kept"    ? "bg-green-500/20 text-green-400" :
                  s.action === "deleted" ? "bg-red-500/20 text-red-400" :
                  "bg-zinc-700 text-zinc-400"
                }`}>
                  {s.action === "kept" ? "✅ Kept" : s.action === "deleted" ? "🗑 Deleted" : s.action}
                </span>
              </div>
            ))}
          </div>

          {/* AI Analysis */}
          {result.analysis && (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-2">
              <p className="text-xs font-semibold text-indigo-400">
                🤖 Gemini Analysis & Next Post Improvements
                {result.hints_stored > 0 && (
                  <span className="ml-2 text-green-400">({result.hints_stored} hints applied to next post ✓)</span>
                )}
              </p>
              <div className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {result.analysis}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
