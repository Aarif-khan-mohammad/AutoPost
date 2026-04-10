"use client";

import { useEffect, useState } from "react";

type ScheduleInfo = {
  channel: string;
  times: string;
  timezone: string;
  jobs: { id: string; next_run: string | null }[];
};

export default function SchedulePanel() {
  const [info, setInfo]       = useState<ScheduleInfo | null>(null);
  const [channel, setChannel] = useState("");
  const [times, setTimes]     = useState("07:00,12:00,18:00");
  const [tz, setTz]           = useState("Asia/Kolkata");
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  const load = async () => {
    const res = await fetch(`/api/schedule`);
    const data = await res.json();
    setInfo(data);
    if (data.channel) setChannel(data.channel);
    if (data.times)   setTimes(data.times);
    if (data.timezone) setTz(data.timezone);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_url: channel, times, timezone: tz }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    load();
  };

  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-6 space-y-4">
      <div>
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">
          ⏰ Auto-Post Schedule
        </h2>
        <p className="text-xs text-zinc-600">Set once — posts automatically every day at these times</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Source Channel URL</label>
          <input
            type="url"
            placeholder="https://www.youtube.com/@ChannelName"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Post Times (24h, comma-separated)</label>
            <input
              type="text"
              value={times}
              onChange={(e) => setTimes(e.target.value)}
              placeholder="07:00,12:00,18:00"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Timezone</label>
            <input
              type="text"
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              placeholder="Asia/Kolkata"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving || !channel}
          className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold hover:bg-indigo-500 active:scale-95 disabled:opacity-40 transition-all"
        >
          {saving ? "Saving…" : saved ? "✓ Saved!" : "💾 Save Schedule"}
        </button>
      </div>

      {/* Next runs */}
      {info?.jobs && info.jobs.length > 0 && (
        <div className="border-t border-zinc-800 pt-3 space-y-1.5">
          <p className="text-xs text-zinc-500 font-medium">Next scheduled runs</p>
          {info.jobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">🕐 {job.id.replace("post_", "").replace("_", ":")}</span>
              <span className="text-zinc-600 font-mono">
                {job.next_run ? new Date(job.next_run).toLocaleString() : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {info?.jobs?.length === 0 && (
        <p className="text-xs text-yellow-500/80">⚠ No schedule active — set a channel URL above</p>
      )}
    </div>
  );
}
