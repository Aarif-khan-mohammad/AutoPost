"use client";

import { useEffect, useState } from "react";

type Job = { id: string; next_run: string | null; one_time?: boolean };
type ScheduleInfo = { channel: string; yt_times: string; ig_times: string; timezone: string; jobs: Job[] };
type Suggestion   = { yt_times: string; ig_times: string; suggested_test: string };

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function today() {
  return new Date().toISOString().split("T")[0];
}

export default function SchedulePanel() {
  // Shared
  const [channel, setChannel] = useState("");
  const [tz, setTz]           = useState("Asia/Kolkata");
  const [info, setInfo]       = useState<ScheduleInfo | null>(null);

  // Recurring
  const [tab, setTab]         = useState("youtube");
  const [ytTimes, setYtTimes] = useState("08:00,20:00");
  const [igTimes, setIgTimes] = useState("09:00,19:00");
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  // Gemini suggestion
  const [suggesting, setSuggesting]   = useState(false);
  const [suggestion, setSuggestion]   = useState<Suggestion | null>(null);

  // One-time posts — support multiple
  const [slots, setSlots] = useState([{ date: today(), time: "" }]);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState("");

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

  // ── Gemini suggest ──────────────────────────────────────────────────────────
  const fetchSuggestion = async () => {
    setSuggesting(true);
    try {
      const res  = await fetch(`/api/schedule/suggest?timezone=${encodeURIComponent(tz)}`);
      const data: Suggestion = await res.json();
      setSuggestion(data);
      setYtTimes(data.yt_times);
      setIgTimes(data.ig_times);
      // Pre-fill first empty time slot with Gemini's suggestion
      setSlots(prev => prev.map((s, i) => i === 0 && !s.time ? { ...s, time: data.suggested_test } : s));
    } finally {
      setSuggesting(false);
    }
  };

  // ── Recurring save ──────────────────────────────────────────────────────────
  const saveRecurring = async () => {
    setSaving(true);
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_url: channel, platform: tab, yt_times: ytTimes, ig_times: igTimes, timezone: tz }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    load();
  };

  // ── One-time schedule ───────────────────────────────────────────────────────
  const scheduleOnce = async () => {
    const valid = slots.filter(s => s.date && s.time);
    if (!valid.length || !channel) return;
    setScheduling(true); setScheduleMsg("");
    const results: string[] = [];
    for (const s of valid) {
      const res  = await fetch("/api/schedule/once", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_url: channel, datetime: `${s.date}T${s.time}`, timezone: tz }),
      });
      const data = await res.json();
      results.push(res.ok ? `✅ ${fmt(data.run_at)}` : `❌ ${data.detail}`);
    }
    setScheduleMsg(results.join("  •  "));
    setScheduling(false);
    load();
  };

  const cancelJob = async (jobId: string) => {
    await fetch(`/api/schedule/once/${jobId}`, { method: "DELETE" });
    load();
  };

  const addSlot    = () => setSlots(p => [...p, { date: today(), time: "" }]);
  const removeSlot = (i: number) => setSlots(p => p.filter((_, idx) => idx !== i));
  const updateSlot = (i: number, key: "date" | "time", val: string) =>
    setSlots(p => p.map((s, idx) => idx === i ? { ...s, [key]: val } : s));

  const recurringJobs = info?.jobs.filter(j => !j.one_time) || [];
  const onceJobs      = info?.jobs.filter(j => j.one_time)  || [];

  const TABS = [
    { key: "youtube",   icon: "🎬", label: "YouTube" },
    { key: "instagram", icon: "📸", label: "Instagram" },
    { key: "both",      icon: "⚡", label: "Both" },
  ];

  return (
    <div className="space-y-4">

      {/* ── Shared channel + timezone ── */}
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-5 space-y-3">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">⚙️ Channel Settings</h2>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Source Channel URL</label>
          <input type="url" placeholder="https://www.youtube.com/@ChannelName"
            value={channel} onChange={e => setChannel(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Timezone</label>
          <input type="text" placeholder="Asia/Kolkata"
            value={tz} onChange={e => setTz(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* ── One-time post card ── */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
        <div>
          <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-widest mb-0.5">📅 Post at Specific Date & Time</h2>
          <p className="text-xs text-zinc-500">Schedule one or more posts at exact dates & times — fires automatically, no interaction needed</p>
        </div>

        {/* Slots */}
        <div className="space-y-2">
          {slots.map((s, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                {i === 0 && <label className="text-xs text-zinc-500 mb-1 block">Date</label>}
                <input type="date" value={s.date} onChange={e => updateSlot(i, "date", e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="flex-1">
                {i === 0 && <label className="text-xs text-zinc-500 mb-1 block">Time ({tz})</label>}
                <input type="time" value={s.time} onChange={e => updateSlot(i, "time", e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              {slots.length > 1 && (
                <button onClick={() => removeSlot(i)}
                  className="mb-0.5 text-red-400 hover:text-red-300 text-lg leading-none px-1">×</button>
              )}
            </div>
          ))}

          <button onClick={addSlot}
            className="text-xs text-amber-400 hover:text-amber-300 font-medium">
            + Add another time slot
          </button>
        </div>

        <button onClick={scheduleOnce}
          disabled={scheduling || !channel || !slots.some(s => s.date && s.time)}
          className="w-full rounded-xl bg-amber-500 text-black px-4 py-2.5 text-sm font-bold hover:bg-amber-400 active:scale-95 disabled:opacity-40 transition-all">
          {scheduling ? "Scheduling…" : "⏰ Schedule Post(s)"}
        </button>

        {scheduleMsg && (
          <p className="text-xs text-center text-zinc-300 break-all">{scheduleMsg}</p>
        )}

        {/* Pending one-time jobs */}
        {onceJobs.length > 0 && (
          <div className="border-t border-zinc-800 pt-3 space-y-1.5">
            <p className="text-xs text-amber-400 font-semibold">Pending scheduled posts</p>
            {onceJobs.map(j => (
              <div key={j.id} className="flex items-center justify-between bg-zinc-900 rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs text-zinc-200 font-mono">{fmt(j.next_run)}</p>
                  <p className="text-xs text-zinc-600">{j.id}</p>
                </div>
                <button onClick={() => cancelJob(j.id)}
                  className="text-xs text-red-400 hover:text-red-300 font-medium px-2 py-1 rounded hover:bg-red-500/10 transition-colors">
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Daily recurring card ── */}
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-5 space-y-4">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">🔁 Daily Auto-Post Schedule</h2>
          <p className="text-xs text-zinc-500">Runs every day automatically — Gemini picks the best times</p>
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

        {/* Gemini suggest */}
        <button onClick={fetchSuggestion} disabled={suggesting}
          className="w-full rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-40 transition-all">
          {suggesting ? "⏳ Asking Gemini…" : "🤖 Get AI-Recommended Times"}
        </button>

        {suggestion && (
          <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2.5 space-y-1.5">
            <p className="text-xs text-zinc-500 font-semibold">Gemini recommends for {tz}:</p>
            <p className="text-xs text-zinc-300">🎬 YouTube: <span className="text-indigo-300 font-mono">{suggestion.yt_times}</span></p>
            <p className="text-xs text-zinc-300">📸 Instagram: <span className="text-pink-300 font-mono">{suggestion.ig_times}</span></p>
            <p className="text-xs text-amber-400 border-t border-zinc-800 pt-1.5 mt-1">
              ⏰ Also pre-filled your one-time test slot with <span className="font-mono">{suggestion.suggested_test}</span>
            </p>
          </div>
        )}

        {/* Manual time override */}
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

        <button onClick={saveRecurring} disabled={saving || !channel}
          className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold hover:bg-indigo-500 active:scale-95 disabled:opacity-40 transition-all">
          {saving ? "Saving…" : saved ? "✓ Saved!" : "💾 Save Daily Schedule"}
        </button>

        {/* Recurring next runs */}
        {recurringJobs.length > 0 && (
          <div className="border-t border-zinc-800 pt-3 space-y-1.5">
            <p className="text-xs text-zinc-500 font-semibold">Next daily runs</p>
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
          <p className="text-xs text-yellow-500/80">⚠ No schedule active — save a schedule above</p>
        )}
      </div>
    </div>
  );
}
