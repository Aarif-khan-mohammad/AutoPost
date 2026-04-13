"use client";

import { useEffect, useRef, useState } from "react";
import { authHeaders } from "@/lib/auth";

type Job = {
  id: string;
  channel_url: string;
  status: "queued" | "processing";
  step: string;
  created_at: string;
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
  const timeAgo = (() => {
    const diff = Math.floor((Date.now() - new Date(job.created_at).getTime()) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  })();

  const activeStage = STAGES.find(s => s.key === job.step);

  return (
    <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/5 p-4 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
            ⚡ Live
          </span>
          <span className="text-xs text-zinc-500">{timeAgo}</span>
        </div>
        <p className="text-xs text-zinc-500 truncate max-w-[180px]">
          {job.channel_url.replace("https://www.youtube.com/", "").replace("https://youtube.com/", "")}
        </p>
      </div>

      {/* Stage progress bar */}
      <StageBar step={job.step} status={job.status} />

      {/* Current step */}
      {activeStage && (
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{activeStage.icon}</span>
          <span className="text-xs text-indigo-300 font-medium">{activeStage.label}</span>
          <span className="inline-flex gap-0.5 ml-1">
            {[0, 150, 300].map(d => (
              <span key={d} className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce"
                style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
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
      const res  = await fetch("/api/jobs", { headers: authHeaders() });
      const data = await res.json();
      // Show only live jobs (queued or processing)
      const live = Array.isArray(data)
        ? data.filter((j: Job) => j.status === "queued" || j.status === "processing")
        : [];
      setJobs(live);
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
  if (jobs.length === 0) return null;

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
