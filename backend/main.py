import os
import uuid
import asyncio
import logging
from contextlib import asynccontextmanager

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
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("autopost")

# ── Scheduler setup ───────────────────────────────────────────────────────────

scheduler = AsyncIOScheduler()

def _setup_scheduler(override: dict = None):
    tz_name = (override or {}).get("timezone") or os.getenv("SCHEDULE_TIMEZONE", "Asia/Kolkata")
    times   = ((override or {}).get("times")    or os.getenv("SCHEDULE_TIMES", "07:00,12:00,18:00")).split(",")
    channel = ((override or {}).get("channel")  or os.getenv("SCHEDULE_CHANNEL_URL", "")).strip()

    if not channel:
        log.warning("[scheduler] SCHEDULE_CHANNEL_URL not set — auto-posting disabled.")
        return

    try:
        tz = pytz.timezone(tz_name)
    except Exception:
        tz = pytz.timezone("Asia/Kolkata")

    if not scheduler.running:
        scheduler.start()

    for t in times:
        try:
            hour, minute = t.strip().split(":")
            scheduler.add_job(
                scheduled_post,
                CronTrigger(hour=int(hour), minute=int(minute), timezone=tz),
                id=f"post_{hour}_{minute}",
                replace_existing=True,
            )
            log.info(f"[scheduler] Scheduled post at {t} {tz_name}")
        except Exception as e:
            log.error(f"[scheduler] Failed to add job for {t}: {e}")

    log.info(f"[scheduler] Running — will post to: {channel}")


async def scheduled_post():
    channel = (_schedule_override.get("channel") or os.getenv("SCHEDULE_CHANNEL_URL", "")).strip()
    if not channel:
        log.warning("[scheduler] Fired but no channel set — skipping")
        return
    job_id = str(uuid.uuid4())
    log.info(f"[scheduler] ⏰ Auto-post triggered")
    log.info(f"[scheduler]   channel : {channel}")
    log.info(f"[scheduler]   job_id  : {job_id}")
    await create_job(job_id, channel)
    asyncio.create_task(run_pipeline(job_id, channel))


# ── App lifespan ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    try:
        _setup_scheduler()
    except Exception as e:
        log.error(f"[scheduler] Startup error (non-fatal): {e}")
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


# ── API models ────────────────────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    channel_url:       str
    youtube_token:     str | None = None
    instagram_token:   str | None = None
    instagram_user_id: str | None = None


class ScheduleConfig(BaseModel):
    channel_url: str
    times:       str = "07:00,12:00,18:00"   # comma-separated 24h
    timezone:    str = "Asia/Kolkata"


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/api/process")
async def process_video(req: ProcessRequest):
    job_id = str(uuid.uuid4())
    log.info(f"[api] ▶ Manual process triggered")
    log.info(f"[api]   job_id      : {job_id}")
    log.info(f"[api]   channel_url : {req.channel_url}")
    log.info(f"[api]   youtube     : {'token provided' if req.youtube_token else 'using .env refresh token'}")
    log.info(f"[api]   instagram   : {'configured' if req.instagram_token else 'skipped'}")
    await create_job(job_id, req.channel_url)
    asyncio.create_task(run_pipeline(job_id, req.channel_url, req))
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# In-memory overrides (survive for the lifetime of the process)
_schedule_override: dict = {}


@app.post("/api/schedule")
async def update_schedule(cfg: ScheduleConfig):
    _schedule_override["channel"]  = cfg.channel_url
    _schedule_override["times"]    = cfg.times
    _schedule_override["timezone"] = cfg.timezone

    scheduler.remove_all_jobs()
    _setup_scheduler(override=_schedule_override)

    log.info(f"[api] 📅 Schedule updated")
    log.info(f"[api]   channel  : {cfg.channel_url}")
    log.info(f"[api]   times    : {cfg.times}")
    log.info(f"[api]   timezone : {cfg.timezone}")
    return {"status": "updated", "channel": cfg.channel_url, "times": cfg.times, "timezone": cfg.timezone}


@app.api_route("/", methods=["GET", "HEAD"])
async def health():
    return {"status": "ok", "service": "autopost"}


@app.get("/api/schedule")
async def get_schedule():
    jobs = [
        {
            "id":       job.id,
            "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
        }
        for job in scheduler.get_jobs()
    ]
    return {
        "channel":  _schedule_override.get("channel")  or os.getenv("SCHEDULE_CHANNEL_URL", ""),
        "times":    _schedule_override.get("times")    or os.getenv("SCHEDULE_TIMES", "07:00,12:00,18:00"),
        "timezone": _schedule_override.get("timezone") or os.getenv("SCHEDULE_TIMEZONE", "Asia/Kolkata"),
        "jobs":     jobs,
    }


# ── Pipeline ──────────────────────────────────────────────────────────────────

async def run_pipeline(job_id: str, channel_url: str, req: ProcessRequest | None = None):
    log.info(f"[pipeline] ═══════════════════════════════════")
    log.info(f"[pipeline] 🚀 Starting job {job_id}")
    log.info(f"[pipeline]   channel : {channel_url}")
    try:
        loop = asyncio.get_event_loop()

        def sync_step(name: str):
            log.info(f"[pipeline] ⟳ Step: {name}")
            asyncio.run_coroutine_threadsafe(
                update_job(job_id, status="processing", step=name), loop
            )

        await update_job(job_id, status="processing", step="downloading")
        already_used = await get_processed_video_ids(channel_url)
        log.info(f"[pipeline] Already processed: {len(already_used)} video(s)")

        output_path, caption, hashtags, video_info = await asyncio.to_thread(
            process_channel, channel_url, job_id, already_used, sync_step
        )

        log.info(f"[pipeline] ✂  Clip ready")
        log.info(f"[pipeline]   title    : {video_info['title']}")
        log.info(f"[pipeline]   video_id : {video_info['video_id']}")
        log.info(f"[pipeline]   duration : {video_info['duration']}s")
        log.info(f"[pipeline]   caption  : {caption}")
        log.info(f"[pipeline]   hashtags : {', '.join(hashtags)}")

        await mark_video_processed(channel_url, video_info["video_id"], video_info["title"])

        await update_job(job_id, status="processing", step="publishing")
        results = {
            "source_title": video_info["title"],
            "source_url":   video_info["url"],
            "caption":      caption,
            "hashtags":     hashtags,
        }

        log.info(f"[pipeline] 📤 Uploading to YouTube...")
        yt_token = req.youtube_token if req else None
        yt_url = await asyncio.to_thread(
            publish_to_youtube, output_path, caption, hashtags, yt_token
        )
        results["youtube"] = yt_url
        log.info(f"[pipeline] ✅ YouTube uploaded: {yt_url}")

        if req and req.instagram_token and req.instagram_user_id:
            log.info(f"[pipeline] 📤 Uploading to Instagram...")
            ig_id = await asyncio.to_thread(
                publish_to_instagram,
                output_path, caption, hashtags,
                req.instagram_token, req.instagram_user_id,
            )
            results["instagram"] = ig_id
            log.info(f"[pipeline] ✅ Instagram posted: {ig_id}")

        await update_job(job_id, status="done", step="complete", results=results)
        log.info(f"[pipeline] 🎉 Job {job_id} DONE")
        log.info(f"[pipeline] ═══════════════════════════════════")

    except Exception as e:
        log.error(f"[pipeline] ❌ Job {job_id} FAILED: {e}")
        log.info(f"[pipeline] ═══════════════════════════════════")
        await update_job(job_id, status="failed", step=str(e))
