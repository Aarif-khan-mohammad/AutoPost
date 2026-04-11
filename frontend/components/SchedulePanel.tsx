"use client";

import { useEffect, useState } from "react";

type ScheduleInfo = {
  channel: string;
  yt_times: string;
  ig_times: string;
  timezone: string;
  jobs: { id: string; next_run: string | null }[];
};

const TABS = [
  { key: "youtube",   label: "YouTube Shorts", icon: "🎬", color: "red" },
  { key: "instagram", label: "Instagram Reels", icon: "📸", color: "pink" },
  { key: "both",      label: "Both",            icon: "⚡", color: "indigo" },
];

export default function SchedulePanel() {
  const [info, setInfo]       = useState<ScheduleInfo | null>(null);
  const [tab, setTab]         = useState("both");
  const [channel, setChannel] = useState("");
  const [ytTimes, setYtTimes] = useState("");
  const [igTimes, setIgTimes] = useState("");
  const [tz, setTz]           = useState("Asia/Kolkata");
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [useGemini, setUseGemini] = useState(true);

  const load = async () => {
    const res = await fetch("/api/schedule");
    const data = await res.json();
    setInfo(data);
    if (data.channel)  setChannel(data.channel);
    if (data.yt_times) setYtTimes(data.yt_times);
    if (data.ig_times) setIgTimes(data.ig_times);
    if (data.timezone) setTz(data.timezone);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel_url: channel,
        platform:    tab,
        yt_times:    useGemini ? "" : ytTimes,
        ig_times:    useGemini ? "" : igTimes,
        timezone:    tz,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    load();
  };

  const ytJobs = info?.jobs.filter(j => j.id.startsWith("yt_")) || [];
  const igJobs = info?.jobs.filter(j => j.id.startsWith("ig_")) || [];

  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-6 space-y-4">
      <div>
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">
          ⏰ Auto-Post Schedule
        </h2>
        <p className="text-xs text-zinc-600">Set once — posts automatically every day</p>
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

        {/* Gemini toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <div onClick={() => setUseGemini(!useGemini)}
            className={`w-9 h-5 rounded-full transition-colors relative ${useGemini ? "bg-indigo-600" : "bg-zinc-700"}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${useGemini ? "translate-x-4" : "translate-x-0.5"}`} />
          </div>
          <span className="text-xs text-zinc-400">
            🤖 Let Gemini pick best times for {tab === "both" ? "YouTube & Instagram" : tab}
          </span>
        </label>

        {!useGemini && (
          <div className="space-y-2">
            {(tab === "youtube" || tab === "both") && (
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">🎬 YouTube times (24h, comma-separated)</label>
                <input type="text" value={ytTimes} onChange={e => setYtTimes(e.target.value)}
                  placeholder="08:00,20:00"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            )}
            {(tab === "instagram" || tab === "both") && (
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">📸 Instagram times (24h, comma-separated)</label>
                <input type="text" value={igTimes} onChange={e => setIgTimes(e.target.value)}
                  placeholder="09:00,19:00"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-pink-500"
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

        <button onClick={save} disabled={saving || !channel}
          className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold hover:bg-indigo-500 active:scale-95 disabled:opacity-40 transition-all">
          {saving ? "Saving…" : saved ? "✓ Saved!" : "💾 Save Schedule"}
        </button>
      </div>

      {/* Next runs */}
      {(ytJobs.length > 0 || igJobs.length > 0) && (
        <div className="border-t border-zinc-800 pt-3 space-y-3">
          {ytJobs.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-red-400 font-medium">🎬 YouTube next runs</p>
              {ytJobs.map(j => (
                <div key={j.id} className="flex justify-between text-xs">
                  <span className="text-zinc-400">🕐 {j.id.replace("yt_", "").replace("_", ":")}</span>
                  <span className="text-zinc-600 font-mono">{j.next_run ? new Date(j.next_run).toLocaleString() : "—"}</span>
                </div>
              ))}
            </div>
          )}
          {igJobs.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-pink-400 font-medium">📸 Instagram next runs</p>
              {igJobs.map(j => (
                <div key={j.id} className="flex justify-between text-xs">
                  <span className="text-zinc-400">🕐 {j.id.replace("ig_", "").replace("_", ":")}</span>
                  <span className="text-zinc-600 font-mono">{j.next_run ? new Date(j.next_run).toLocaleString() : "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {info?.jobs?.length === 0 && (
        <p className="text-xs text-yellow-500/80">⚠ No schedule active — set a channel URL above</p>
      )}
    </div>
  );
}
