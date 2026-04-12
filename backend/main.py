import os
import uuid
import asyncio
import logging
from contextlib import asynccontextmanager

import google.generativeai as genai
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import pytz

from database import (
    init_db, create_job, update_job, get_job,
    get_processed_video_ids, mark_video_processed,
)
from slicer import process_channel
from publisher import publish_to_youtube, publish_to_instagram

load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("autopost")

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# ── Scheduler ─────────────────────────────────────────────────────────────────

scheduler = AsyncIOScheduler()
_schedule_override: dict = {}


def _gemini_best_times(timezone: str) -> tuple[str, str]:
    try:
        model = genai.GenerativeModel("gemini-2.0-flash")
        prompt = f"""You are a social media growth expert.
Given timezone {timezone}, what are the 2 best times (24h HH:MM) to post on:
1. YouTube Shorts — maximize algorithm boost (peak watch time, trending window)
2. Instagram Reels — maximize engagement (peak active hours, explore page boost)

Consider platform-specific algorithms:
- YouTube: rewards early morning uploads before commute + evening prime time
- Instagram: rewards posts when followers are most active (check engagement patterns)

Reply EXACTLY in this format (no extra text):
YOUTUBE: HH:MM,HH:MM
INSTAGRAM: HH:MM,HH:MM"""
        resp = model.generate_content(prompt).text.strip()
        yt, ig = "08:00,20:00", "09:00,19:00"
        for line in resp.splitlines():
            if line.startswith("YOUTUBE:"):
                yt = line.split(":", 1)[1].strip()
            elif line.startswith("INSTAGRAM:"):
                ig = line.split(":", 1)[1].strip()
        log.info(f"[scheduler] Gemini times — YT: {yt} | IG: {ig}")
        return yt, ig
    except Exception as e:
        log.warning(f"[scheduler] Gemini time recommendation failed: {e}")
        return "08:00,20:00", "09:00,19:00"


def _setup_scheduler(override: dict = None):
    cfg     = override or {}
    tz_name = cfg.get("timezone") or os.getenv("SCHEDULE_TIMEZONE", "Asia/Kolkata")
    channel = (cfg.get("channel") or os.getenv("SCHEDULE_CHANNEL_URL", "")).strip()

    yt_times = (cfg.get("yt_times") or os.getenv("SCHEDULE_YT_TIMES", "08:00,20:00")).split(",")
    ig_times = (cfg.get("ig_times") or os.getenv("SCHEDULE_IG_TIMES", "09:00,19:00")).split(",")

    if not channel:
        log.warning("[scheduler] SCHEDULE_CHANNEL_URL not set — auto-posting disabled.")
        return

    try:
        tz = pytz.timezone(tz_name)
    except Exception:
        tz = pytz.timezone("Asia/Kolkata")

    if not scheduler.running:
        scheduler.start()

    for t in yt_times:
        try:
            h, m = t.strip().split(":")
            scheduler.add_job(
                scheduled_post, CronTrigger(hour=int(h), minute=int(m), timezone=tz),
                id=f"yt_{h}_{m}", replace_existing=True, kwargs={"platform": "youtube"},
            )
            log.info(f"[scheduler] YouTube @ {t} {tz_name}")
        except Exception as e:
            log.error(f"[scheduler] YT job error {t}: {e}")

    for t in ig_times:
        try:
            h, m = t.strip().split(":")
            scheduler.add_job(
                scheduled_post, CronTrigger(hour=int(h), minute=int(m), timezone=tz),
                id=f"ig_{h}_{m}", replace_existing=True, kwargs={"platform": "instagram"},
            )
            log.info(f"[scheduler] Instagram @ {t} {tz_name}")
        except Exception as e:
            log.error(f"[scheduler] IG job error {t}: {e}")

    log.info(f"[scheduler] Active — channel: {channel}")


async def scheduled_post(platform: str = "youtube"):
    channel = (_schedule_override.get("channel") or os.getenv("SCHEDULE_CHANNEL_URL", "")).strip()
    if not channel:
        log.warning("[scheduler] Fired but no channel configured — skipping")
        return
    job_id = str(uuid.uuid4())
    log.info(f"[scheduler] ⏰ Auto-post triggered platform={platform} channel={channel}")
    await create_job(job_id, channel)
    # Use server .env credentials — no per-request token needed
    req = ProcessRequest(channel_url=channel, platform=platform)
    asyncio.create_task(run_pipeline(job_id, channel, req, platform=platform))


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    try:
        _setup_scheduler()
    except Exception as e:
        log.error(f"[scheduler] Startup error: {e}")
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    channel_url:       str
    platform:          str = "youtube"   # youtube | instagram | both
    youtube_token:     str | None = None
    instagram_token:   str | None = None
    instagram_user_id: str | None = None


class ScheduleConfig(BaseModel):
    channel_url: str
    platform:    str = "both"
    yt_times:    str = ""   # empty = ask Gemini
    ig_times:    str = ""
    timezone:    str = "Asia/Kolkata"


# ── Routes ────────────────────────────────────────────────────────────────────

@app.api_route("/", methods=["GET", "HEAD"])
async def health():
    return {"status": "ok", "service": "autopost"}


@app.post("/api/process")
async def process_video(req: ProcessRequest):
    job_id = str(uuid.uuid4())
    log.info(f"[api] ▶ Manual post platform={req.platform} channel={req.channel_url}")
    await create_job(job_id, req.channel_url)
    asyncio.create_task(run_pipeline(job_id, req.channel_url, req, platform=req.platform))
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.post("/api/schedule")
async def update_schedule(cfg: ScheduleConfig):
    yt = cfg.yt_times.strip() or None
    ig = cfg.ig_times.strip() or None

    if not yt or not ig:
        yt_gem, ig_gem = _gemini_best_times(cfg.timezone)
        yt = yt or yt_gem
        ig = ig or ig_gem

    _schedule_override.update({
        "channel":  cfg.channel_url,
        "timezone": cfg.timezone,
        "yt_times": yt,
        "ig_times": ig,
    })

    scheduler.remove_all_jobs()
    _setup_scheduler(override=_schedule_override)

    log.info(f"[api] 📅 Schedule saved — YT: {yt} | IG: {ig}")
    return {"status": "updated", "channel": cfg.channel_url, "yt_times": yt, "ig_times": ig, "timezone": cfg.timezone}


@app.get("/api/schedule")
async def get_schedule():
    jobs = [
        {"id": j.id, "next_run": j.next_run_time.isoformat() if j.next_run_time else None}
        for j in scheduler.get_jobs()
    ]
    return {
        "channel":  _schedule_override.get("channel")  or os.getenv("SCHEDULE_CHANNEL_URL", ""),
        "yt_times": _schedule_override.get("yt_times") or os.getenv("SCHEDULE_YT_TIMES", "08:00,20:00"),
        "ig_times": _schedule_override.get("ig_times") or os.getenv("SCHEDULE_IG_TIMES", "09:00,19:00"),
        "timezone": _schedule_override.get("timezone") or os.getenv("SCHEDULE_TIMEZONE", "Asia/Kolkata"),
        "jobs":     jobs,
    }


# ── Pipeline ──────────────────────────────────────────────────────────────────

async def run_pipeline(job_id: str, channel_url: str, req: ProcessRequest | None = None, platform: str = "youtube"):
    log.info(f"[pipeline] 🚀 Job {job_id} platform={platform} channel={channel_url}")
    try:
        loop = asyncio.get_event_loop()

        def sync_step(name: str):
            asyncio.run_coroutine_threadsafe(update_job(job_id, status="processing", step=name), loop)

        await update_job(job_id, status="processing", step="downloading")
        already_used = await get_processed_video_ids(channel_url)

        output_path, caption, hashtags, video_info = await asyncio.to_thread(
            process_channel, channel_url, job_id, already_used, sync_step, platform
        )

        log.info(f"[pipeline] ✂ Clip ready: '{video_info['title']}' ({video_info['duration']}s)")
        await mark_video_processed(channel_url, video_info["video_id"], video_info["title"])
        await update_job(job_id, status="processing", step="publishing")

        results = {
            "source_title": video_info["title"],
            "source_url":   video_info["url"],
            "caption":      caption,
            "hashtags":     hashtags,
        }

        if platform in ("youtube", "both"):
            yt_token = req.youtube_token if req else None
            yt_url = await asyncio.to_thread(publish_to_youtube, output_path, caption, hashtags, yt_token)
            results["youtube"] = yt_url
            log.info(f"[pipeline] ✅ YouTube: {yt_url}")

        if platform in ("instagram", "both") and req and req.instagram_token and req.instagram_user_id:
            ig_id = await asyncio.to_thread(
                publish_to_instagram, output_path, caption, hashtags,
                req.instagram_token, req.instagram_user_id,
            )
            results["instagram"] = ig_id
            log.info(f"[pipeline] ✅ Instagram: {ig_id}")

        await update_job(job_id, status="done", step="complete", results=results)
        log.info(f"[pipeline] 🎉 Job {job_id} DONE")

    except Exception as e:
        log.error(f"[pipeline] ❌ Job {job_id} FAILED: {e}")
        await update_job(job_id, status="failed", step=str(e))
