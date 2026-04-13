"use client";

import { useEffect, useState } from "react";

type Job = { id: string; next_run: string | null; one_time?: boolean };

type ScheduleInfo = {
  channel: string;
  yt_times: string;
  ig_times: string;
  timezone: string;
  jobs: Job[];
};

const TABS = [
  { key: "youtube",   label: "YouTube Shorts", icon: "🎬" },
  { key: "instagram", label: "Instagram Reels", icon: "📸" },
  { key: "both",      label: "Both",            icon: "⚡" },
];

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}

export default function SchedulePanel() {
  const [info, setInfo]           = useState<ScheduleInfo | null>(null);
  const [tab, setTab]             = useState("youtube");
  const [channel, setChannel]     = useState("");
  const [ytTimes, setYtTimes]     = useState("");
  const [igTimes, setIgTimes]     = useState("");
  const [tz, setTz]               = useState("Asia/Kolkata");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [useGemini, setUseGemini] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<{yt_times:string; ig_times:string; suggested_test:string} | null>(null);

  // One-time post state
  const [onceChannel, setOnceChannel] = useState("");
  const [onceDate, setOnceDate]       = useState("");
  const [onceTime, setOnceTime]       = useState("");
  const [onceSaving, setOnceSaving]   = useState(false);
  const [onceDone, setOnceDone]       = useState("");

  const fetchSuggestion = async () => {
    setSuggesting(true);
    try {
      const res  = await fetch(`/api/schedule/suggest?timezone=${encodeURIComponent(tz)}`);
      const data = await res.json();
      setSuggestion(data);
      // Auto-fill recurring times
      setYtTimes(data.yt_times);
      setIgTimes(data.ig_times);
      // Auto-fill one-time test time with Gemini's first recommended time
      setOnceTime(data.suggested_test);
    } finally {
      setSuggesting(false);
    }
  };

  const load = async () => {
    const res  = await fetch("/api/schedule");
    const data = await res.json();
    setInfo(data);
    if (data.channel)  setChannel(data.channel);
    if (data.yt_times) setYtTimes(data.yt_times);
    if (data.ig_times) setIgTimes(data.ig_times);
    if (data.timezone) setTz(data.timezone);
  };

  useEffect(() => { load(); }, []);

  const saveRecurring = async () => {
    setSaving(true);
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel_url: channel, platform: tab,
        yt_times: useGemini ? "" : ytTimes,
        ig_times: useGemini ? "" : igTimes,
        timezone: tz,
      }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    load();
  };

  const scheduleOnce = async () => {
    if (!onceDate || !onceTime || !onceChannel) return;
    setOnceSaving(true); setOnceDone("");
    const res = await fetch("/api/schedule/once", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel_url: onceChannel,
        datetime:    `${onceDate}T${onceTime}`,
        timezone:    tz,
      }),
    });
    const data = await res.json();
    setOnceSaving(false);
    setOnceDone(res.ok ? `✅ Scheduled for ${fmt(data.run_at)}` : `❌ ${data.detail}`);
    load();
  };

  const cancelJob = async (jobId: string) => {
    await fetch(`/api/schedule/once/${jobId}`, { method: "DELETE" });
    load();
  };

  const recurringJobs = info?.jobs.filter(j => !j.one_time) || [];
  const onceJobs      = info?.jobs.filter(j => j.one_time)  || [];

  // Default onceChannel to recurring channel
  useEffect(() => { if (channel && !onceChannel) setOnceChannel(channel); }, [channel]);

  // Default date to today
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setOnceDate(today);
  }, []);

  return (
    <div className="space-y-4">

      {/* ── One-time post card ── */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
        <div>
          <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-widest mb-0.5">📅 Schedule One-Time Post</h2>
          <p className="text-xs text-zinc-600">Post once at a specific date & time — fires automatically</p>
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Channel URL</label>
            <input type="url" placeholder="https://www.youtube.com/@ChannelName"
              value={onceChannel} onChange={e => setOnceChannel(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Date</label>
              <input type="date" value={onceDate} onChange={e => setOnceDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Time ({tz})</label>
              <input type="time" value={onceTime} onChange={e => setOnceTime(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <button onClick={scheduleOnce} disabled={onceSaving || !onceChannel || !onceDate || !onceTime}
            className="w-full rounded-xl bg-amber-500 text-black px-4 py-2.5 text-sm font-bold hover:bg-amber-400 active:scale-95 disabled:opacity-40 transition-all">
            {onceSaving ? "Scheduling…" : "⏰ Schedule This Post"}
          </button>

          {onceDone && <p className="text-xs text-center text-zinc-300">{onceDone}</p>}
        </div>

        {/* Pending one-time jobs */}
        {onceJobs.length > 0 && (
          <div className="border-t border-zinc-800 pt-3 space-y-1.5">
            <p className="text-xs text-amber-400 font-medium">Pending one-time posts</p>
            {onceJobs.map(j => (
              <div key={j.id} className="flex items-center justify-between text-xs bg-zinc-900 rounded-lg px-3 py-2">
                <span className="text-zinc-300 font-mono">{fmt(j.next_run)}</span>
                <button onClick={() => cancelJob(j.id)}
                  className="text-red-400 hover:text-red-300 text-xs font-medium">
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recurring schedule card ── */}
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-5 space-y-4">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">🔁 Daily Recurring Schedule</h2>
          <p className="text-xs text-zinc-600">Posts automatically every day at these times</p>
        </div>

        {/* Platform tabs */}
        <div className="flex gap-1 bg-zinc-950 rounded-xl p-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                tab === t.key ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Source Channel URL</label>
            <input type="url" placeholder="https://www.youtube.com/@ChannelName"
              value={channel} onChange={e => setChannel(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer" onClick={() => setUseGemini(!useGemini)}>
            <div className={`w-9 h-5 rounded-full transition-colors relative ${useGemini ? "bg-indigo-600" : "bg-zinc-700"}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${useGemini ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <span className="text-xs text-zinc-400">🤖 Let Gemini pick best posting times</span>
          </label>

          {useGemini && (
            <div className="space-y-2">
              <button onClick={fetchSuggestion} disabled={suggesting}
                className="w-full rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-40 transition-all">
                {suggesting ? "⏳ Asking Gemini…" : "🤖 Get AI-Recommended Times"}
              </button>
              {suggestion && (
                <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 space-y-1">
                  <p className="text-xs text-zinc-500 font-medium">Gemini suggests:</p>
                  <p className="text-xs text-zinc-300">🎬 YouTube: <span className="text-indigo-300 font-mono">{suggestion.yt_times}</span></p>
                  <p className="text-xs text-zinc-300">📸 Instagram: <span className="text-pink-300 font-mono">{suggestion.ig_times}</span></p>
                  <p className="text-xs text-amber-400">⏰ Test time auto-filled: <span className="font-mono">{suggestion.suggested_test}</span></p>
                </div>
              )}
            </div>
          )}

          {!useGemini && (
            <div className="space-y-2">
              {(tab === "youtube" || tab === "both") && (
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">🎬 YouTube times (24h, comma-separated)</label>
                  <input type="text" value={ytTimes} onChange={e => setYtTimes(e.target.value)}
                    placeholder="08:00,20:00"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
              {(tab === "instagram" || tab === "both") && (
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">📸 Instagram times (24h, comma-separated)</label>
                  <input type="text" value={igTimes} onChange={e => setIgTimes(e.target.value)}
                    placeholder="09:00,19:00"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Timezone</label>
            <input type="text" value={tz} onChange={e => setTz(e.target.value)}
              placeholder="Asia/Kolkata"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button onClick={saveRecurring} disabled={saving || !channel}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold hover:bg-indigo-500 active:scale-95 disabled:opacity-40 transition-all">
            {saving ? "Saving…" : saved ? "✓ Saved!" : "💾 Save Recurring Schedule"}
          </button>
        </div>

        {/* Recurring next runs */}
        {recurringJobs.length > 0 && (
          <div className="border-t border-zinc-800 pt-3 space-y-1.5">
            <p className="text-xs text-zinc-500 font-medium">Next recurring runs</p>
            {recurringJobs.map(j => (
              <div key={j.id} className="flex justify-between text-xs">
                <span className="text-zinc-400">
                  {j.id.startsWith("yt_") ? "🎬" : "📸"} {j.id.replace(/^(yt|ig)_/, "").replace("_", ":")}
                </span>
                <span className="text-zinc-600 font-mono">{fmt(j.next_run)}</span>
              </div>
            ))}
          </div>
        )}

        {info?.jobs?.length === 0 && (
          <p className="text-xs text-yellow-500/80">⚠ No schedule active — set a channel URL above</p>
        )}
      </div>
    </div>
  );
}
