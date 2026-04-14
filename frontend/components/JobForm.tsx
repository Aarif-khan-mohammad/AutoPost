"use client";

import { useState } from "react";
import { authHeaders } from "@/lib/auth";

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
  };
};

const STAGES = [
  { key: "queued",      label: "Queued",      icon: "🕐", desc: "Job created" },
  { key: "downloading", label: "Fetching",    icon: "⬇️", desc: "Getting latest short from channel" },
  { key: "analyzing",   label: "AI Analysis", icon: "🤖", desc: "Gemini finding best hook + caption" },
  { key: "slicing",     label: "Slicing",     icon: "✂️", desc: "Cropping to 1080×1920 vertical" },
  { key: "publishing",  label: "Publishing",  icon: "🚀", desc: "Uploading to platform(s)" },
  { key: "complete",    label: "Done",        icon: "✅", desc: "Posted successfully!" },
];

const PLATFORM_TABS = [
  { key: "youtube",   label: "YouTube",   icon: "🎬" },
  { key: "instagram", label: "Instagram", icon: "📸" },
  { key: "both",      label: "Both",      icon: "⚡" },
];

function StageCard({ stage, state }: { stage: typeof STAGES[0]; state: "done" | "active" | "pending" | "failed" }) {
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
              {[0, 150, 300].map(d => (
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

export default function JobForm({ mode, canPost = true }: { mode: "admin" | "user"; canPost?: boolean }) {
  const [platform, setPlatform] = useState("youtube");
  const [form, setForm] = useState({
    channel_url: "", youtube_token: "", instagram_token: "", instagram_user_id: "",
  });
  const [job, setJob]         = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [pollRef, setPollRef] = useState<ReturnType<typeof setInterval> | null>(null);

  // Scheduled post state
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedSlots, setSchedSlots]     = useState([{ date: new Date().toISOString().split("T")[0], time: "" }]);
  const [schedTz, setSchedTz]           = useState("Asia/Kolkata");
  const [scheduling, setScheduling]     = useState(false);
  const [schedMsg, setSchedMsg]         = useState("");
  const [pendingJobs, setPendingJobs]   = useState<{ id: string; next_run: string | null }[]>([]);

  const isUser  = mode === "user";
  const isAdmin = mode === "admin";

  const loadPending = async () => {
    const res  = await fetch("/api/schedule", { headers: authHeaders() });
    const data = await res.json();
    setPendingJobs((data.jobs || []).filter((j: { id: string; one_time?: boolean }) => j.one_time));
  };

  const poll = (jobId: string) => {
    const iv = setInterval(async () => {
      const res  = await fetch(`/api/jobs/${jobId}`, { headers: authHeaders() });
      const data: JobStatus = await res.json();
      setJob(data);
      if (data.status === "done" || data.status === "failed") {
        clearInterval(iv); setLoading(false); setPollRef(null);
      }
    }, 3000);
    setPollRef(iv);
  };

  const cancelJob = async () => {
    if (!job || job.job_id === "pending" || job.job_id === "error") {
      if (pollRef) clearInterval(pollRef);
      setLoading(false); setJob(null); setPollRef(null);
      return;
    }
    try {
      await fetch(`/api/jobs/${job.job_id}/cancel`, {
        method: "POST", headers: authHeaders(),
      });
    } catch { /* best effort */ }
    if (pollRef) clearInterval(pollRef);
    setJob(prev => prev ? { ...prev, status: "failed", step: "Cancelled by user" } : null);
    setLoading(false); setPollRef(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPost) return;
    setLoading(true);
    setJob({ job_id: "pending", status: "queued", step: "queued" });
    try {
      const payload: Record<string, string> = { channel_url: form.channel_url, platform };
      if (isUser && form.youtube_token)  payload.youtube_token     = form.youtube_token;
      if (form.instagram_token)          payload.instagram_token   = form.instagram_token;
      if (form.instagram_user_id)        payload.instagram_user_id = form.instagram_user_id;

      const res  = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Request failed");
      setJob({ job_id: data.job_id, status: "queued", step: "queued" });
      poll(data.job_id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setJob({ job_id: "error", status: "failed", step: msg });
      setLoading(false);
    }
  };

  const scheduleOnce = async () => {
    const valid = schedSlots.filter(s => s.date && s.time);
    if (!valid.length || !form.channel_url) return;
    setScheduling(true); setSchedMsg("");
    const results: string[] = [];
    for (const s of valid) {
      const payload: Record<string, string> = {
        channel_url: form.channel_url,
        datetime: `${s.date}T${s.time}`,
        timezone: schedTz,
        platform,
      };
      if (isUser && form.youtube_token)  payload.youtube_token     = form.youtube_token;
      if (form.instagram_token)          payload.instagram_token   = form.instagram_token;
      if (form.instagram_user_id)        payload.instagram_user_id = form.instagram_user_id;

      const res  = await fetch("/api/schedule/once", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const dt   = data.run_at ? new Date(data.run_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
      results.push(res.ok ? `✅ ${dt}` : `❌ ${data.detail}`);
    }
    setSchedMsg(results.join("  •  "));
    setScheduling(false);
    loadPending();
  };

  const cancelJob = async (jobId: string) => {
    await fetch(`/api/schedule/once/${jobId}`, { method: "DELETE", headers: authHeaders() });
    loadPending();
  };

  const addSlot    = () => setSchedSlots(p => [...p, { date: new Date().toISOString().split("T")[0], time: "" }]);
  const removeSlot = (i: number) => setSchedSlots(p => p.filter((_, idx) => idx !== i));
  const updateSlot = (i: number, k: "date" | "time", v: string) =>
    setSchedSlots(p => p.map((s, idx) => idx === i ? { ...s, [k]: v } : s));

  const activeIdx = job ? STAGES.findIndex(s => s.key === job.step) : -1;
  const isFailed  = job?.status === "failed";

  // Credential fields — reused in both instant and scheduled sections
  const credFields = (
    <>
      {(platform === "youtube" || platform === "both") && isUser && (
        <div className="space-y-1.5 rounded-lg border border-zinc-700 bg-zinc-950 p-3">
          <p className="text-xs text-red-400 font-medium">🎬 YouTube OAuth Token</p>
          <p className="text-xs text-zinc-600">
            Get from{" "}
            <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" className="text-indigo-400 underline">
              OAuth Playground
            </a>{" "}
            with <code className="text-indigo-400">youtube.upload</code> scope
          </p>
          <input type="password" placeholder="ya29.a0..."
            value={form.youtube_token} onChange={e => setForm({ ...form, youtube_token: e.target.value })}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      )}
      {(platform === "instagram" || platform === "both") && (
        <div className="space-y-1.5 rounded-lg border border-zinc-700 bg-zinc-950 p-3">
          <p className="text-xs text-pink-400 font-medium">📸 Instagram Credentials</p>
          <input type="password" placeholder="Instagram Access Token"
            value={form.instagram_token} onChange={e => setForm({ ...form, instagram_token: e.target.value })}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-pink-500"
          />
          <input type="text" placeholder="Instagram User ID"
            value={form.instagram_user_id} onChange={e => setForm({ ...form, instagram_user_id: e.target.value })}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-pink-500"
          />
        </div>
      )}
    </>
  );

  return (
    <div className="w-full max-w-lg mx-auto space-y-5">

      {/* ── Instant post card ── */}
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-6 space-y-4">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">
            {isAdmin ? "Manual Post" : "Post Now"}
          </h2>
          <p className="text-xs text-zinc-600">
            {isAdmin ? "Posts using server credentials — no token needed" : "Provide your source channel + credentials"}
          </p>
        </div>

        {/* Platform tabs — user restricted to single platform only */}
        <div className="flex gap-1 bg-zinc-950 rounded-xl p-1">
          {(isUser ? PLATFORM_TABS.filter(t => t.key !== "both") : PLATFORM_TABS).map(t => (
            <button key={t.key} onClick={() => setPlatform(t.key)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                platform === t.key ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {isUser && (
          <p className="text-xs text-amber-400/80 bg-amber-500/10 rounded-lg px-3 py-2">
            ⚠ Free accounts can post to <strong>YouTube or Instagram</strong> — not both. Choose one.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Source Channel URL</label>
            <input required type="url" placeholder="https://www.youtube.com/@ChannelName"
              value={form.channel_url} onChange={e => setForm({ ...form, channel_url: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {credFields}

          {isAdmin && (
            <p className="text-xs text-zinc-600 bg-zinc-900 rounded-lg px-3 py-2">
              🔐 YouTube uses server credentials from <code className="text-indigo-400">.env</code>
            </p>
          )}

          {!canPost ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-center">
              <p className="text-sm font-semibold text-red-400">Post Limit Reached</p>
              <p className="text-xs text-zinc-500 mt-1">You've used your 1 free post. Contact admin to upgrade.</p>
            </div>
          ) : (
            <button type="submit" disabled={loading}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold hover:bg-indigo-500 active:scale-95 disabled:opacity-40 transition-all">
              {loading ? "Processing…" : `⚡ Post Now to ${PLATFORM_TABS.find(t => t.key === platform)?.label}`}
            </button>
          )}
        </form>
      </div>

      {/* ── Schedule at specific date & time ── */}
      {canPost && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
          <button onClick={() => { setShowSchedule(!showSchedule); loadPending(); }}
            className="w-full flex items-center justify-between">
            <div className="text-left">
              <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-widest">📅 Post at Specific Date & Time</h2>
              <p className="text-xs text-zinc-600 mt-0.5">Schedule for any future date & time — fires automatically</p>
            </div>
            <span className={`text-zinc-500 transition-transform ${showSchedule ? "rotate-180" : ""}`}>▾</span>
          </button>

          {showSchedule && (
            <div className="space-y-3">
              {form.channel_url ? (
                <p className="text-xs text-zinc-500 bg-zinc-900 rounded-lg px-3 py-2">
                  📺 <span className="text-zinc-300">{form.channel_url.replace("https://www.youtube.com/", "")}</span>
                </p>
              ) : (
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Source Channel URL</label>
                  <input type="url" placeholder="https://www.youtube.com/@ChannelName"
                    value={form.channel_url} onChange={e => setForm({ ...form, channel_url: e.target.value })}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              )}

              {credFields}

              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Timezone</label>
                <input type="text" value={schedTz} onChange={e => setSchedTz(e.target.value)}
                  placeholder="Asia/Kolkata"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="space-y-2">
                {schedSlots.map((s, i) => (
                  <div key={i} className="flex gap-2 items-end">
                    <div className="flex-1">
                      {i === 0 && <label className="text-xs text-zinc-500 mb-1 block">Date</label>}
                      <input type="date" value={s.date} onChange={e => updateSlot(i, "date", e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div className="flex-1">
                      {i === 0 && <label className="text-xs text-zinc-500 mb-1 block">Time</label>}
                      <input type="time" value={s.time} onChange={e => updateSlot(i, "time", e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    {schedSlots.length > 1 && (
                      <button onClick={() => removeSlot(i)} className="text-red-400 hover:text-red-300 text-xl pb-1">×</button>
                    )}
                  </div>
                ))}
                <button onClick={addSlot} className="text-xs text-amber-400 hover:text-amber-300 font-medium">
                  + Add another time slot
                </button>
              </div>

              <button onClick={scheduleOnce}
                disabled={scheduling || !form.channel_url || !schedSlots.some(s => s.date && s.time)}
                className="w-full rounded-xl bg-amber-500 text-black px-4 py-2.5 text-sm font-bold hover:bg-amber-400 active:scale-95 disabled:opacity-40 transition-all">
                {scheduling ? "Scheduling…" : "⏰ Schedule Post(s)"}
              </button>

              {schedMsg && <p className="text-xs text-center text-zinc-300 break-all">{schedMsg}</p>}

              {pendingJobs.length > 0 && (
                <div className="border-t border-zinc-800 pt-3 space-y-1.5">
                  <p className="text-xs text-amber-400 font-semibold">Pending scheduled posts</p>
                  {pendingJobs.map(j => (
                    <div key={j.id} className="flex items-center justify-between bg-zinc-900 rounded-lg px-3 py-2">
                      <p className="text-xs text-zinc-300 font-mono">
                        {j.next_run ? new Date(j.next_run).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                      </p>
                      <button onClick={() => cancelJob(j.id)}
                        className="text-xs text-red-400 hover:text-red-300 font-medium px-2 py-1 rounded hover:bg-red-500/10 transition-colors">
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Pipeline cards ── */}
      {job && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Pipeline</h2>
            {loading && (
              <button onClick={cancelJob}
                className="text-xs text-red-400 hover:text-red-300 font-medium px-3 py-1 rounded-lg border border-red-500/30 hover:bg-red-500/10 transition-all">
                ✕ Stop
              </button>
            )}
          </div>
          {STAGES.map((stage, idx) => {
            let state: "done" | "active" | "pending" | "failed" = "pending";
            if (isFailed && idx === activeIdx)  state = "failed";
            else if (idx < activeIdx)           state = "done";
            else if (idx === activeIdx)         state = job.status === "done" ? "done" : "active";
            return <StageCard key={stage.key} stage={stage} state={state} />;
          })}
          {isFailed && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
              <p className="text-sm font-semibold text-red-300 mb-1">Error</p>
              <p className="font-mono text-xs text-red-300 break-all opacity-80">{job.step}</p>
            </div>
          )}
          {job.status === "done" && (
            <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 space-y-3">
              <p className="text-sm font-semibold text-green-400">🎉 Posted!</p>
              {job.results?.source_title && (
                <a href={job.results.source_url} target="_blank" rel="noreferrer"
                  className="block rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 hover:border-zinc-500 transition-colors">
                  <p className="text-xs text-zinc-500 mb-0.5">Source</p>
                  <p className="text-sm text-zinc-200 truncate">{job.results.source_title}</p>
                </a>
              )}
              {job.results?.caption && (
                <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2">
                  <p className="text-xs text-zinc-500 mb-1">Caption</p>
                  <p className="text-sm text-zinc-200">{job.results.caption}</p>
                </div>
              )}
              {job.results?.hashtags && (
                <div className="flex flex-wrap gap-1.5">
                  {job.results.hashtags.map(tag => (
                    <span key={tag} className="text-xs bg-indigo-500/20 text-indigo-300 rounded-full px-2.5 py-0.5">#{tag}</span>
                  ))}
                </div>
              )}
              {job.results?.youtube && (
                <a href={job.results.youtube} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 underline underline-offset-2">
                  🎬 View YouTube Short ↗
                </a>
              )}
              {job.results?.instagram && (
                <p className="text-sm text-pink-400">📸 IG: <span className="font-mono text-xs">{job.results.instagram}</span></p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
