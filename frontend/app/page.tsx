"use client";

import { useState } from "react";
import JobForm from "@/components/JobForm";
import SchedulePanel from "@/components/SchedulePanel";

export default function Home() {
  const [tab, setTab] = useState<"admin" | "user">("admin");

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center px-4 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">AutoPost</h1>
        <p className="mt-2 text-zinc-400 text-sm">
          AI-powered YouTube Shorts &amp; Instagram Reels automation
        </p>
      </div>

      {/* Top-level tabs */}
      <div className="w-full max-w-lg mb-6">
        <div className="flex gap-1 bg-zinc-900 rounded-2xl p-1 border border-zinc-800">
          <button onClick={() => setTab("admin")}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
              tab === "admin" ? "bg-indigo-600 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
            }`}>
            🛡️ Admin Post
          </button>
          <button onClick={() => setTab("user")}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
              tab === "user" ? "bg-indigo-600 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
            }`}>
            👤 New User
          </button>
        </div>
      </div>

      <div className="w-full max-w-lg space-y-6">
        {tab === "admin" ? (
          <>
            <SchedulePanel />
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-800" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-zinc-950 px-3 text-xs text-zinc-600">or post manually</span>
              </div>
            </div>
            <JobForm mode="admin" canPost={true} />
          </>
        ) : (
          <JobForm mode="user" canPost={true} />
        )}
      </div>
    </main>
  );
}
