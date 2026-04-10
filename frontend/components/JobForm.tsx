"use client";

import { useState } from "react";

type JobStatus = {
  job_id: string;
  status: "queued" | "processing" | "done" | "failed";
  step: string;
  results?: {
    youtube?: string;
    instagram?: string;
    caption?: string;
    hashtags?: string[];
    source_title?: string;
    source_url?: string;
    window_start?: number;
    window_end?: number;
  };
};

const STAGES = [
  { key: "queued",      label: "Queued",      icon: "🕐", desc: "Job created, waiting to start" },
  { key: "downloading", label: "Fetching",    icon: "⬇️", desc: "Getting latest video from channel" },
  { key: "analyzing",   label: "AI Analysis", icon: "🤖", desc: "Gemini finding the best 60s hook" },
  { key: "slicing",     label: "Slicing",     icon: "✂️", desc: "Cropping to 1080×1920 vertical" },
  { key: "publishing",  label: "Publishing",  icon: "🚀", desc: "Uploading to YouTube Shorts" },
  { key: "complete",    label: "Done",        icon: "✅", desc: "Posted successfully!" },
];

function StageCard({
  stage,
  state,
}: {
  stage: (typeof STAGES)[0];
  state: "done" | "active" | "pending" | "failed";
}) {
  const styles = {
    done:    "border-green-500/50 bg-green-500/10 text-green-400",
    active:  "border-indigo-500 bg-indigo-500/15 text-indigo-300 shadow-lg shadow-indigo-500/20",
    pending: "border-zinc-800 bg-zinc-900/50 text-zinc-600",
    failed:  "border-red-500/50 bg-red-500/10 text-red-400",
  };
  return (
    <div className={`rounded-xl border p-3.5 flex items-center gap-3 transition-all duration-300 ${styles[state]}`}>
      <span className="text-xl">{stage.icon}</span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{stage.label}</span>
          {state === "active" && (
            <span className="inline-flex gap-0.5">
              {[0, 150, 300].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          )}
          {state === "done" && <span className="text-xs text-green-500 font-bold">✓</span>}
        </div>
        <p className="text-xs opacity-60 mt-0.5">{stage.desc}</p>
      </div>
    </div>
  );
}

export default function JobForm() {
  const [form, setForm] = useState({
    channel_url:      "",
    youtube_token:    "",
    instagram_token:  "",
    instagram_user_id: "",
  });
  const [job, setJob]       = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const poll = (jobId: string) => {
    const iv = setInterval(async () => {
      const res  = await fetch(`/api/jobs/${jobId}`);
      const data: JobStatus = await res.json();
      setJob(data);
      if (data.status === "done" || data.status === "failed") {
        clearInterval(iv);
        setLoading(false);
      }
    }, 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setJob(null);
    const res  = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setJob({ job_id: data.job_id, status: "queued", step: "queued" });
    poll(data.job_id);
  };

  const activeIdx = job ? STAGES.findIndex((s) => s.key === job.step) : -1;
  const isFailed  = job?.status === "failed";

  return (
    <div className="w-full max-w-lg mx-auto space-y-5">

      {/* ── Input card ── */}
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-6 space-y-4">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">Source Channel</h2>
          <p className="text-xs text-zinc-600">Paste any YouTube channel URL — we'll grab the latest video automatically</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            type="url"
            placeholder="https://www.youtube.com/@ChannelName"
            value={form.channel_url}
            onChange={(e) => setForm({ ...form, channel_url: e.target.value })}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {/* YouTube token */}
          <details className="group rounded-lg border border-zinc-700 bg-zinc-950">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-zinc-400 list-none flex items-center justify-between">
              <span>🎬 YouTube Upload Token <span className="text-xs text-zinc-600 ml-1">(optional if configured on server)</span></span>
              <span className="text-zinc-600 group-open:rotate-180 transition-transform text-xs">▾</span>
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-1.5">
              <p className="text-xs text-zinc-600">OAuth access token with <code className="text-indigo-400">youtube.upload</code> scope</p>
              <input
                type="password"
                placeholder="ya29.a0..."
                value={form.youtube_token}
                onChange={(e) => setForm({ ...form, youtube_token: e.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </details>

          {/* Instagram token */}
          <details className="group rounded-lg border border-zinc-700 bg-zinc-950">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-zinc-400 list-none flex items-center justify-between">
              <span>📸 Instagram Credentials</span>
              <span className="text-zinc-600 group-open:rotate-180 transition-transform text-xs">▾</span>
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-1.5">
              <input
                type="password"
                placeholder="Instagram Access Token"
                value={form.instagram_token}
                onChange={(e) => setForm({ ...form, instagram_token: e.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="text"
                placeholder="Instagram User ID"
                value={form.instagram_user_id}
                onChange={(e) => setForm({ ...form, instagram_user_id: e.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </details>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold tracking-wide hover:bg-indigo-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? "Processing…" : "⚡ Fetch & Post Today's Short"}
          </button>
        </form>
      </div>

      {/* ── Pipeline cards ── */}
      {job && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest px-1">Pipeline</h2>

          {STAGES.map((stage, idx) => {
            let state: "done" | "active" | "pending" | "failed" = "pending";
            if (isFailed && idx === activeIdx)   state = "failed";
            else if (idx < activeIdx)            state = "done";
            else if (idx === activeIdx)          state = job.status === "done" ? "done" : "active";
            return <StageCard key={stage.key} stage={stage} state={state} />;
          })}

          {/* Error */}
          {isFailed && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
              <p className="font-semibold mb-1">Error</p>
              <p className="font-mono text-xs break-all opacity-80">{job.step}</p>
            </div>
          )}

          {/* Results */}
          {job.status === "done" && (
            <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 space-y-3">
              <p className="text-sm font-semibold text-green-400">🎉 Short Posted!</p>

              {/* Source video */}
              {job.results?.source_title && (
                <a href={job.results.source_url} target="_blank" rel="noreferrer"
                  className="block rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 hover:border-zinc-500 transition-colors">
                  <p className="text-xs text-zinc-500 mb-0.5">Source video</p>
                  <p className="text-sm text-zinc-200 truncate">{job.results.source_title}</p>
                  {job.results.window_start !== undefined && (
                    <p className="text-xs text-zinc-600 mt-0.5">
                      Segment: {Math.floor((job.results.window_start ?? 0) / 60)}m – {Math.floor((job.results.window_end ?? 0) / 60)}m
                    </p>
                  )}
                </a>
              )}

              {/* Caption */}
              {job.results?.caption && (
                <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2">
                  <p className="text-xs text-zinc-500 mb-1">Caption</p>
                  <p className="text-sm text-zinc-200">{job.results.caption}</p>
                </div>
              )}

              {/* Hashtags */}
              {job.results?.hashtags && (
                <div className="flex flex-wrap gap-1.5">
                  {job.results.hashtags.map((tag) => (
                    <span key={tag} className="text-xs bg-indigo-500/20 text-indigo-300 rounded-full px-2.5 py-0.5">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {job.results?.youtube && (
                <a href={job.results.youtube} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                  🎬 View YouTube Short ↗
                </a>
              )}
              {job.results?.instagram && (
                <p className="text-sm text-zinc-400">
                  📸 Instagram Post ID: <span className="font-mono text-xs">{job.results.instagram}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
