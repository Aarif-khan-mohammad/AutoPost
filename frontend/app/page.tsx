import JobForm from "@/components/JobForm";
import SchedulePanel from "@/components/SchedulePanel";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center px-4 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">AutoPost</h1>
        <p className="mt-2 text-zinc-400 text-sm">
          AI-powered YouTube Shorts automation
        </p>
      </div>
      <div className="w-full max-w-lg space-y-6">
        <SchedulePanel />
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-800" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-zinc-950 px-3 text-xs text-zinc-600">or post manually</span>
          </div>
        </div>
        <JobForm />
      </div>
    </main>
  );
}
