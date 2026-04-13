"use client";

import { useEffect, useRef, useState } from "react";

type Job = {
  id: string;
  channel_url: string;
  status: "queued" | "processing" | "done" | "failed";
  step: string;
  created_at: string;
  results?: {
    youtube?: string;
    instagram?: string;
    caption?: string;
    hashtags?: string[];
    source_title?: string;
    source_url?: string;
  };
};

const STAGES = [
  { key: "queued",      label: "Queued",      icon: "🕐" },
  { key: "downloading", label: "Fetching",    icon: "⬇️" },
  { key: "analyzing",   label: "AI Analysis", icon: "🤖" },
  { key: "slicing",     label: "Slicing",     icon: "✂️" },
  { key: "publishing",  label: "Publishing",  icon: "🚀" },
  { key: "complete",    label: "Done",        icon: "✅" },
];

function StageBar({ step, status }: { step: string; status: Job["status"] }) {
  const activeIdx = STAGES.findIndex(s => s.key === step);
  const isFailed  = status === "failed";

  return (
    <div className="flex gap-1 mt-3">
      {STAGES.map((s, i) => {
        let bg = "bg-zinc-800";
        if (isFailed && i === activeIdx)  bg = "bg-red-500";
        else if (i < activeIdx)           bg = "bg-green-500";
        else if (i === activeIdx)         bg = status === "done" ? "bg-green-500" : "bg-indigo-500";
        return (
          <div key={s.key} className="flex-1 flex flex-col items-center gap-1">
            <div className={`h-1.5 w-full rounded-full transition-all duration-500 ${bg} ${i === activeIdx && status === "processing" ? "animate-pulse" : ""}`} />
            <span className={`text-[9px] font-medium ${i <= activeIdx ? "text-zinc-400" : "text-zinc-700"}`}>
              {s.icon}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  const isFailed  = job.status === "failed";
  const isDone    = job.status === "done";
  const isActive  = job.status === "processing" || job.status === "queued";

  const borderColor = isFailed ? "border-red-500/40" : isDone ? "border-green-500/40" : "border-indigo-500/40";
  const bgColor     = isFailed ? "bg-red-500/5"      : isDone ? "bg-green-500/5"      : "bg-indigo-500/5";

  const activeStage = STAGES.find(s => s.key === job.step);
  const timeAgo     = (() => {
    const diff = Math.floor((Date.now() - new Date(job.created_at).getTime()) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  })();

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4 space-y-2`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              isFailed ? "bg-red-500/20 text-red-400" :
              isDone   ? "bg-green-500/20 text-green-400" :
                         "bg-indigo-500/20 text-indigo-300"
            }`}>
              {isFailed ? "❌ Failed" : isDone ? "✅ Done" : isActive ? "⚡ Live" : "🕐 Queued"}
            </span>
            <span className="text-xs text-zinc-600">{timeAgo}</span>
          </div>
          <p className="text-xs text-zinc-500 truncate mt-1">
            {job.channel_url.replace("https://www.youtube.com/", "").replace("https://youtube.com/", "")}
          </p>
        </div>
      </div>

      {/* Stage progress bar */}
      <StageBar step={job.step} status={job.status} />

      {/* Current step label */}
      {isActive && activeStage && (
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{activeStage.icon}</span>
          <span className="text-xs text-indigo-300 font-medium">{activeStage.label}</span>
          <span className="inline-flex gap-0.5 ml-1">
            {[0,150,300].map(d => (
              <span key={d} className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
        </div>
      )}

      {/* Error */}
      {isFailed && (
        <p className="text-xs text-red-300 font-mono break-all bg-red-500/10 rounded px-2 py-1">
          {job.step}
        </p>
      )}

      {/* Results */}
      {isDone && job.results && (
        <div className="space-y-2 pt-1">
          {job.results.source_title && (
            <a href={job.results.source_url} target="_blank" rel="noreferrer"
              className="block text-xs text-zinc-400 truncate hover:text-zinc-200 transition-colors">
              📹 {job.results.source_title}
            </a>
          )}
          {job.results.caption && (
            <p className="text-xs text-zinc-300 bg-zinc-900 rounded px-2 py-1.5 line-clamp-2">
              {job.results.caption}
            </p>
          )}
          {job.results.hashtags && (
            <div className="flex flex-wrap gap-1">
              {job.results.hashtags.map(t => (
                <span key={t} className="text-[10px] bg-indigo-500/20 text-indigo-300 rounded-full px-2 py-0.5">#{t}</span>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            {job.results.youtube && (
              <a href={job.results.youtube} target="_blank" rel="noreferrer"
                className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2">
                🎬 YouTube Short ↗
              </a>
            )}
            {job.results.instagram && (
              <span className="text-xs text-pink-400">📸 IG: {job.results.instagram}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LiveFeed() {
  const [jobs, setJobs]       = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef           = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJobs = async () => {
    try {
      const res  = await fetch("/api/jobs");
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    // Poll every 3s while any job is active
    intervalRef.current = setInterval(async () => {
      await fetchJobs();
    }, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const activeCount = jobs.filter(j => j.status === "processing" || j.status === "queued").length;

  if (loading) return null;
  if (jobs.length === 0) return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-center">
      <p className="text-xs text-zinc-600">No posts yet — trigger a manual post or wait for a scheduled one</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
          📡 Live Activity Feed
        </h2>
        {activeCount > 0 && (
          <span className="text-xs bg-indigo-500/20 text-indigo-300 rounded-full px-2 py-0.5 font-medium">
            {activeCount} active
          </span>
        )}
      </div>
      {jobs.map(job => <JobCard key={job.id} job={job} />)}
    </div>
  );
}
