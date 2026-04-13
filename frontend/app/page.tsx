"use client";

import { useState } from "react";
import JobForm from "@/components/JobForm";
import SchedulePanel from "@/components/SchedulePanel";
import LiveFeed from "@/components/LiveFeed";

export default function Home() {
  const [tab, setTab] = useState<"schedule" | "manual">("schedule");

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center px-4 py-12">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight">AutoPost</h1>
        <p className="mt-2 text-zinc-400 text-sm">AI-powered YouTube Shorts automation</p>
      </div>

      <div className="w-full max-w-lg space-y-5">

        {/* Live feed — always visible, shows all job types */}
        <LiveFeed />

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-2xl p-1 border border-zinc-800">
          <button onClick={() => setTab("schedule")}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
              tab === "schedule" ? "bg-indigo-600 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
            }`}>
            ⏰ Schedule
          </button>
          <button onClick={() => setTab("manual")}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
              tab === "manual" ? "bg-indigo-600 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
            }`}>
            ⚡ Manual Post
          </button>
        </div>

        {tab === "schedule" ? <SchedulePanel /> : <JobForm mode="admin" />}
      </div>
    </main>
  );
}
