import os
import uuid
import asyncio
import logging
from contextlib import asynccontextmanager

import google.generativeai as genai
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import pytz

from database import (
    init_db, create_job, update_job, get_job, list_jobs,
    get_processed_video_ids, mark_video_processed, _get_client,
    create_user, get_user_by_email, get_user_by_id, get_user_post_count,
)
from auth import (
    hash_password, verify_password, create_token,
    get_current_user, require_admin,
)
from slicer import process_channel
from publisher import publish_to_youtube, publish_to_instagram, get_my_shorts_stats, delete_youtube_video

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

    # Default: 3 posts/day at US peak hours (IST) — morning commute, lunch, evening
    # 07:00 IST = 9:30 PM EST prev day (night owls), 17:30 IST = 7 AM EST, 22:30 IST = 12 PM EST
    yt_times = (cfg.get("yt_times") or os.getenv("SCHEDULE_YT_TIMES", "06:00,17:00,21:30,01:30")).split(",")
    ig_times = (cfg.get("ig_times") or os.getenv("SCHEDULE_IG_TIMES", "06:00,17:00,21:30,01:30")).split(",")

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


async def scheduled_post(
    platform: str = "youtube",
    channel_override: str = "",
    yt_token: str | None = None,
    ig_token: str | None = None,
    ig_uid:   str | None = None,
):
    # Rotate through all channels sequentially for even coverage
    channels_env = os.getenv("SCHEDULE_CHANNEL_URLS", "")
    if channels_env:
        channels = [c.strip() for c in channels_env.split(",") if c.strip()]
    else:
        single = (_schedule_override.get("channel") or os.getenv("SCHEDULE_CHANNEL_URL", "")).strip()
        channels = [single] if single else []

    if channel_override.strip():
        channels = [channel_override.strip()]

    if not channels:
        log.warning("[scheduler] Fired but no channel configured — skipping")
        return

    # Pick channel based on current hour to distribute evenly across the day
    from datetime import datetime
    hour_index = datetime.now().hour % len(channels)
    channel = channels[hour_index]
    job_id = str(uuid.uuid4())
    log.info(f"[scheduler] ⏰ Auto-post triggered platform={platform} channel={channel} ({hour_index+1}/{len(channels)})")
    await create_job(job_id, channel)
    req = ProcessRequest(
        channel_url=channel,
        platform=platform,
        youtube_token=yt_token,
        instagram_token=ig_token,
        instagram_user_id=ig_uid,
    )
    asyncio.create_task(run_pipeline(job_id, channel, req, platform=platform))


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    try:
        # Auto-get Gemini recommended times on startup if not manually overridden
        tz = os.getenv("SCHEDULE_TIMEZONE", "Asia/Kolkata")
        if not os.getenv("SCHEDULE_YT_TIMES") and not os.getenv("SCHEDULE_IG_TIMES"):
            log.info("[scheduler] Asking Gemini for best posting times...")
            yt, ig = await asyncio.to_thread(_gemini_best_times, tz)
            # Ensure 3 slots — Gemini gives 2, add a morning slot
            yt_slots = yt.split(",")
            ig_slots = ig.split(",")
            if len(yt_slots) < 3:
                yt_slots = ["07:00"] + yt_slots
            if len(ig_slots) < 3:
                ig_slots = ["07:00"] + ig_slots
            _schedule_override["yt_times"] = ",".join(yt_slots)
            _schedule_override["ig_times"] = ",".join(ig_slots)
            log.info(f"[scheduler] Gemini times set — YT: {_schedule_override['yt_times']} | IG: {_schedule_override['ig_times']}")
        _setup_scheduler(_schedule_override if _schedule_override else None)
    except Exception as e:
        log.error(f"[scheduler] Startup error: {e}")
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(lifespan=lifespan)
# Build allowed origins list
_origins = [
    "http://localhost:3000",
    "https://auto-post-kohl.vercel.app",
    os.getenv("FRONTEND_URL", ""),
    os.getenv("NGROK_URL", ""),
]
ALLOWED_ORIGINS = [o for o in _origins if o]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.ngrok-free\.app|https://.*\.ngrok-free\.dev",
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "ngrok-skip-browser-warning"],
    max_age=600,
)


# ── Models ────────────────────────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    channel_url:       str
    platform:          str = "youtube"
    youtube_token:     str | None = None
    instagram_token:   str | None = None
    instagram_user_id: str | None = None


class ScheduleConfig(BaseModel):
    channel_url: str
    platform:    str = "both"
    yt_times:    str = ""
    ig_times:    str = ""
    timezone:    str = "Asia/Kolkata"


class SignupRequest(BaseModel):
    email:    str
    password: str


class LoginRequest(BaseModel):
    email:    str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email:    str
    token:    str
    password: str


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.post("/api/auth/signup")
async def signup(req: SignupRequest):
    existing = await get_user_by_email(req.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    await create_user(user_id, req.email, hash_password(req.password), role="user")
    token = create_token(user_id, "user")
    return {"token": token, "user_id": user_id, "role": "user", "email": req.email}


@app.post("/api/auth/login")
async def login(req: LoginRequest):
    user = await get_user_by_email(req.email)
    if not user or not verify_password(req.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"], user["role"])
    return {"token": token, "user_id": user["id"], "role": user["role"], "email": user["email"]}


@app.get("/api/auth/me")
async def me(user: dict = Depends(get_current_user)):
    data = await get_user_by_id(user["user_id"])
    if not data:
        raise HTTPException(status_code=404, detail="User not found")
    post_count = await get_user_post_count(user["user_id"])
    return {
        "user_id":    data["id"],
        "email":      data["email"],
        "role":       data["role"],
        "post_count": post_count,
        "can_post":   data["role"] == "admin" or post_count < 1,
    }


# In-memory reset tokens {email: token} — good enough for single-server
_reset_tokens: dict[str, str] = {}

# Optimization hints from analytics — applied to next post
_optimization_hints: list[str] = []


@app.post("/api/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    user = await get_user_by_email(req.email)
    if not user:
        # Don't reveal whether email exists
        return {"message": "If that email exists, a reset code has been sent."}

    import secrets, smtplib
    from email.mime.text import MIMEText

    token = secrets.token_urlsafe(32)
    _reset_tokens[req.email] = token

    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    frontend  = os.getenv("FRONTEND_URL", "http://localhost:3000")

    if smtp_host and smtp_user:
        try:
            msg = MIMEText(
                f"Your AutoPost password reset code:\n\n{token}\n\n"
                f"Or use this link: {frontend}/reset-password?email={req.email}&token={token}\n\n"
                f"This code expires when the server restarts."
            )
            msg["Subject"] = "AutoPost — Reset Your Password"
            msg["From"]    = smtp_user
            msg["To"]      = req.email
            with smtplib.SMTP(smtp_host, smtp_port) as s:
                s.starttls()
                s.login(smtp_user, smtp_pass)
                s.send_message(msg)
            log.info(f"[auth] Reset email sent to {req.email}")
        except Exception as e:
            log.error(f"[auth] Failed to send reset email: {e}")
    else:
        # No SMTP configured — log token for dev use
        log.info(f"[auth] RESET TOKEN for {req.email}: {token}")

    return {"message": "If that email exists, a reset code has been sent."}


@app.post("/api/auth/reset-password")
async def reset_password(req: ResetPasswordRequest):
    # Allow "supabase" as token bypass when called from frontend after Supabase auth
    if req.token != "supabase":
        stored = _reset_tokens.get(req.email)
        if not stored or stored != req.token:
            raise HTTPException(status_code=400, detail="Invalid or expired reset code")

    user = await get_user_by_email(req.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    _get_client().table("users").update(
        {"hashed_password": hash_password(req.password)}
    ).eq("email", req.email).execute()

    if req.token != "supabase":
        del _reset_tokens[req.email]
    log.info(f"[auth] Password reset for {req.email}")
    return {"message": "Password updated successfully"}


# ── Routes ────────────────────────────────────────────────────────────────────

@app.api_route("/", methods=["GET", "HEAD"])
async def health():
    return {"status": "ok", "service": "autopost"}


@app.post("/api/process")
async def process_video(req: ProcessRequest, user: dict = Depends(get_current_user)):
    # Enforce 1-post limit for regular users
    if user["role"] != "admin":
        count = await get_user_post_count(user["user_id"])
        if count >= 1:
            raise HTTPException(
                status_code=403,
                detail="Free tier limit reached. You have already made 1 successful post."
            )
    job_id = str(uuid.uuid4())
    log.info(f"[api] ▶ Manual post user={user['user_id']} role={user['role']} platform={req.platform}")
    await create_job(job_id, req.channel_url, user_id=user["user_id"])
    asyncio.create_task(run_pipeline(job_id, req.channel_url, req, platform=req.platform, user_id=user["user_id"]))
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/jobs")
async def list_recent_jobs(user: dict = Depends(get_current_user)):
    # Admin sees all jobs; users see only their own
    uid = None if user["role"] == "admin" else user["user_id"]
    return await list_jobs(user_id=uid, limit=10)


@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str, user: dict = Depends(get_current_user)):
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Users can only see their own jobs
    if user["role"] != "admin" and job.get("user_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
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


@app.get("/api/schedule/suggest")
async def suggest_times(timezone: str = "Asia/Kolkata"):
    """Ask Gemini for best posting times and return them — frontend uses these to pre-fill fields."""
    yt, ig = await asyncio.to_thread(_gemini_best_times, timezone)
    # Return first time from each as the recommended test time
    yt_first = yt.split(",")[0].strip()
    ig_first = ig.split(",")[0].strip()
    return {
        "yt_times":      yt,
        "ig_times":      ig,
        "yt_first":      yt_first,
        "ig_first":      ig_first,
        "suggested_test": yt_first,   # recommended one-time test time
    }


@app.post("/api/schedule/once")
async def schedule_once(payload: dict):
    from apscheduler.triggers.date import DateTrigger
    from datetime import datetime

    channel  = payload.get("channel_url", "").strip()
    dt_str   = payload.get("datetime", "")
    tz_name  = payload.get("timezone", "Asia/Kolkata")
    platform = payload.get("platform", "youtube")
    # User credentials (optional — used when user provides their own tokens)
    yt_token  = payload.get("youtube_token") or None
    ig_token  = payload.get("instagram_token") or None
    ig_uid    = payload.get("instagram_user_id") or None

    if not channel or not dt_str:
        raise HTTPException(status_code=400, detail="channel_url and datetime are required")

    try:
        tz     = pytz.timezone(tz_name)
        run_at = tz.localize(datetime.strptime(dt_str, "%Y-%m-%dT%H:%M"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid datetime or timezone: {e}")

    # Use timestamp + channel hash for unique job id so multiple slots don't collide
    job_id_tag = f"once_{run_at.strftime('%Y%m%d_%H%M')}_{abs(hash(channel)) % 9999:04d}"
    scheduler.add_job(
        scheduled_post,
        DateTrigger(run_date=run_at),
        id=job_id_tag,
        replace_existing=True,
        kwargs={
            "platform":         platform,
            "channel_override": channel,
            "yt_token":         yt_token,
            "ig_token":         ig_token,
            "ig_uid":           ig_uid,
        },
    )
    log.info(f"[scheduler] One-time post @ {run_at} channel={channel} platform={platform}")
    return {"status": "scheduled", "run_at": run_at.isoformat(), "job_id": job_id_tag}


@app.delete("/api/schedule/once/{job_id}")
async def cancel_once(job_id: str):
    job = scheduler.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    scheduler.remove_job(job_id)
    return {"status": "cancelled", "job_id": job_id}


@app.get("/api/schedule")
async def get_schedule():
    jobs = [
        {"id": j.id, "next_run": j.next_run_time.isoformat() if j.next_run_time else None,
         "one_time": j.id.startswith("once_")}
        for j in scheduler.get_jobs()
    ]
    return {
        "channel":  _schedule_override.get("channel")  or os.getenv("SCHEDULE_CHANNEL_URL", ""),
        "yt_times": _schedule_override.get("yt_times") or os.getenv("SCHEDULE_YT_TIMES", "06:00,17:00,21:30,01:30"),
        "ig_times": _schedule_override.get("ig_times") or os.getenv("SCHEDULE_IG_TIMES", "06:00,17:00,21:30,01:30"),
        "timezone": _schedule_override.get("timezone") or os.getenv("SCHEDULE_TIMEZONE", "Asia/Kolkata"),
        "jobs":     jobs,
    }



@app.get("/api/analytics/shorts")
async def get_shorts_analytics(user: dict = Depends(get_current_user)):
    """Fetch latest 5 Shorts, check views, delete low performers, get Gemini insights."""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    try:
        shorts = await asyncio.to_thread(get_my_shorts_stats, 5)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch stats: {e}")

    VIEW_THRESHOLD = int(os.getenv("SHORTS_VIEW_THRESHOLD", "1000"))
    deleted = []
    kept    = []

    for short in shorts:
        if short["views"] < VIEW_THRESHOLD:
            try:
                await asyncio.to_thread(delete_youtube_video, short["video_id"])
                short["action"] = "deleted"
                deleted.append(short)
                log.info(f"[analytics] Deleted: {short['title']} ({short['views']} views)")
            except Exception as e:
                short["action"] = f"delete_failed"
                kept.append(short)
        else:
            short["action"] = "kept"
            kept.append(short)

    analysis = ""
    if shorts:
        try:
            model = genai.GenerativeModel("gemini-2.0-flash")
            lines = []
            for s in shorts:
                lines.append(
                    f"- '{s['title']}': {s['views']} views, "
                    f"{s['likes']} likes, action: {s['action']}"
                )
            shorts_summary = "\n".join(lines)
            prompt = (
                f"You are a YouTube Shorts growth expert. Analyze these recent Shorts:\n\n"
                f"{shorts_summary}\n\n"
                f"View threshold: {VIEW_THRESHOLD}\n\n"
                f"1. Why are low-performing Shorts not getting views?\n"
                f"2. What specific improvements for the NEXT Short?\n"
                f"3. Better title format, tags, or content style?\n\n"
                f"Reply in 3-5 bullet points starting with -"
            )
            analysis = model.generate_content(prompt).text.strip()
            global _optimization_hints
            _optimization_hints = [
                line.strip() for line in analysis.splitlines()
                if line.strip().startswith("-")
            ]
            log.info(f"[analytics] Stored {len(_optimization_hints)} optimization hints")
        except Exception as e:
            analysis = f"Gemini analysis failed: {e}"

    return {
        "shorts":       shorts,
        "kept":         len(kept),
        "deleted":      len(deleted),
        "threshold":    VIEW_THRESHOLD,
        "analysis":     analysis,
        "hints_stored": len(_optimization_hints),
    }


@app.get("/api/analytics/hints")
async def get_optimization_hints(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return {"hints": _optimization_hints}




@app.post("/api/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, user: dict = Depends(get_current_user)):
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if user["role"] != "admin" and job.get("user_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if job["status"] in ("done", "failed"):
        return {"status": job["status"], "message": "Job already completed"}
    await update_job(job_id, status="failed", step="Cancelled by user")
    log.info(f"[api] Job {job_id} cancelled")
    return {"status": "cancelled"}

async def run_pipeline(job_id: str, channel_url: str, req: ProcessRequest | None = None, platform: str = "youtube", user_id: str = "system"):
    log.info(f"[pipeline] 🚀 Job {job_id} user={user_id} platform={platform} channel={channel_url}")
    try:
        loop = asyncio.get_event_loop()

        def sync_step(name: str):
            asyncio.run_coroutine_threadsafe(update_job(job_id, status="processing", step=name), loop)

        await update_job(job_id, status="processing", step="downloading")
        already_used = await get_processed_video_ids(channel_url, user_id=user_id)

        output_path, caption, hashtags, video_info = await asyncio.to_thread(
            process_channel, channel_url, job_id, already_used, sync_step, platform
        )

        log.info(f"[pipeline] ✂ Clip ready: '{video_info['title']}' ({video_info['duration']}s)")
        await mark_video_processed(channel_url, video_info["video_id"], video_info["title"], user_id=user_id)
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
