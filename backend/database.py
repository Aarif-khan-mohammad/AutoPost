import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
    return _client


async def init_db():
    """SQL to run once in Supabase SQL editor — see bottom of this file."""
    pass


# ── Users ─────────────────────────────────────────────────────────────────────

async def create_user(user_id: str, email: str, hashed_password: str, role: str = "user") -> dict:
    res = _get_client().table("users").insert({
        "id":              user_id,
        "email":           email,
        "hashed_password": hashed_password,
        "role":            role,
    }).execute()
    return res.data[0] if res.data else {}


async def get_user_by_email(email: str) -> dict | None:
    res = _get_client().table("users").select("*").eq("email", email).execute()
    return res.data[0] if res.data else None


async def get_user_by_id(user_id: str) -> dict | None:
    res = _get_client().table("users").select("*").eq("id", user_id).execute()
    return res.data[0] if res.data else None


async def get_user_post_count(user_id: str) -> int:
    """Count successful posts for a user (for free tier limit enforcement)."""
    res = (
        _get_client().table("jobs")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("status", "done")
        .execute()
    )
    return res.count or 0


# ── Jobs ──────────────────────────────────────────────────────────────────────

async def create_job(job_id: str, channel_url: str, user_id: str = "system"):
    _get_client().table("jobs").insert({
        "id":          job_id,
        "channel_url": channel_url,
        "user_id":     user_id,
        "status":      "queued",
        "step":        "queued",
    }).execute()


async def update_job(job_id: str, status: str, step: str, results: dict = None):
    data = {"status": status, "step": step}
    if results:
        data["results"] = results
    _get_client().table("jobs").update(data).eq("id", job_id).execute()


async def get_job(job_id: str) -> dict | None:
    res = _get_client().table("jobs").select("*").eq("id", job_id).single().execute()
    return res.data


async def list_jobs(user_id: str = None, limit: int = 10) -> list:
    q = _get_client().table("jobs").select("*").order("created_at", desc=True).limit(limit)
    if user_id and user_id != "system":
        q = q.eq("user_id", user_id)
    return q.execute().data or []


# ── Processed videos (scoped per user+channel) ────────────────────────────────

async def get_processed_video_ids(channel_url: str, user_id: str = "system") -> list[str]:
    res = (
        _get_client().table("processed_videos")
        .select("video_id")
        .eq("channel_url", channel_url)
        .eq("user_id", user_id)
        .execute()
    )
    return [r["video_id"] for r in (res.data or [])]


async def mark_video_processed(channel_url: str, video_id: str, video_title: str, user_id: str = "system"):
    _get_client().table("processed_videos").upsert({
        "channel_url": channel_url,
        "video_id":    video_id,
        "video_title": video_title,
        "user_id":     user_id,
    }).execute()


"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RUN THIS SQL ONCE IN SUPABASE SQL EDITOR:
https://supabase.com/dashboard/project/byoimovysjqbsflcopar/sql/new
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Users table (role: admin | user)
create table if not exists users (
    id               text        primary key default gen_random_uuid()::text,
    email            text        not null unique,
    hashed_password  text        not null,
    role             text        not null default 'user',
    created_at       timestamptz not null default now()
);

-- Jobs table (scoped by user)
drop table if exists jobs cascade;
create table jobs (
    id           text        primary key,
    user_id      text        not null default 'system',
    channel_url  text        not null,
    status       text        not null default 'queued',
    step         text,
    results      jsonb,
    created_at   timestamptz not null default now()
);
create index jobs_user_idx on jobs (user_id);
create index jobs_status_idx on jobs (status);

-- Processed videos (scoped by user)
drop table if exists processed_videos cascade;
create table processed_videos (
    id           bigserial   primary key,
    user_id      text        not null default 'system',
    channel_url  text        not null,
    video_id     text        not null,
    video_title  text,
    processed_at timestamptz not null default now(),
    unique (user_id, channel_url, video_id)
);

-- To make someone admin, run:
-- update users set role = 'admin' where email = 'your@email.com';
"""
