"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import JobForm from "@/components/JobForm";
import SchedulePanel from "@/components/SchedulePanel";
import LiveFeed from "@/components/LiveFeed";

export default function Home() {
  const { user, loading, logout, refresh } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"schedule" | "post">("post");

  useEffect(() => {
    if (!loading && !user) router.push("/auth");
  }, [loading, user, router]);

  // Refresh user data to get latest post_count
  useEffect(() => {
    if (user) refresh();
  }, []);

  if (loading || !user) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
    </div>
  );

  const isAdmin   = user.role === "admin";
  const canPost   = user.can_post;
  const postCount = user.post_count;

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center px-4 py-10">

      {/* Header */}
      <div className="w-full max-w-lg flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AutoPost</h1>
          <p className="text-xs text-zinc-500 mt-0.5">AI-powered YouTube Shorts automation</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-zinc-400 truncate max-w-[140px]">{user.email}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isAdmin ? "bg-indigo-500/20 text-indigo-300" : "bg-zinc-700 text-zinc-400"
            }`}>
              {isAdmin ? "👑 Admin" : "👤 User"}
            </span>
          </div>
          <button onClick={logout}
            className="text-xs text-zinc-500 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10">
            Logout
          </button>
        </div>
      </div>

      <div className="w-full max-w-lg space-y-4">

        {/* Free user post limit banner */}
        {!isAdmin && (
          <div className={`rounded-xl border px-4 py-3 ${
            canPost
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-red-500/40 bg-red-500/10"
          }`}>
            {canPost ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-amber-400">Free Account</p>
                  <p className="text-xs text-zinc-500 mt-0.5">You have <span className="text-white font-bold">1 free post</span> remaining — YouTube or Instagram</p>
                </div>
                <span className="text-2xl font-bold text-amber-400">1</span>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold text-red-400">Post Limit Reached</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  You've used your 1 free post ({postCount} done). Contact admin to upgrade.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Live feed */}
        <LiveFeed />

        {/* Tabs — admin gets Schedule tab, users only get Post */}
        <div className="flex gap-1 bg-zinc-900 rounded-2xl p-1 border border-zinc-800">
          <button onClick={() => setTab("post")}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
              tab === "post" ? "bg-indigo-600 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
            }`}>
            ⚡ {isAdmin ? "Manual Post" : "Post Now"}
          </button>
          {isAdmin && (
            <button onClick={() => setTab("schedule")}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
                tab === "schedule" ? "bg-indigo-600 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
              }`}>
              ⏰ Schedule
            </button>
          )}
        </div>

        {tab === "schedule" && isAdmin
          ? <SchedulePanel />
          : <JobForm mode={isAdmin ? "admin" : "user"} canPost={canPost} />
        }
      </div>
    </main>
  );
}
