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
    """
    Run once in Supabase SQL editor:

    create table if not exists jobs (
        id           text        primary key,
        channel_url  text        not null,
        status       text        not null default 'queued',
        step         text,
        results      jsonb,
        created_at   timestamptz not null default now()
    );

    -- Tracks which video_ids have already been processed per channel
    create table if not exists processed_videos (
        id           bigserial   primary key,
        channel_url  text        not null,
        video_id     text        not null,
        video_title  text,
        processed_at timestamptz not null default now(),
        unique (channel_url, video_id)
    );
    """
    pass


# ── Jobs ──────────────────────────────────────────────────────────────────────

async def create_job(job_id: str, channel_url: str):
    _get_client().table("jobs").insert({
        "id": job_id, "channel_url": channel_url,
        "status": "queued", "step": "queued",
    }).execute()


async def update_job(job_id: str, status: str, step: str, results: dict = None):
    data = {"status": status, "step": step}
    if results:
        data["results"] = results
    _get_client().table("jobs").update(data).eq("id", job_id).execute()


async def get_job(job_id: str) -> dict | None:
    res = _get_client().table("jobs").select("*").eq("id", job_id).single().execute()
    return res.data


# ── Processed video tracking ──────────────────────────────────────────────────

async def get_processed_video_ids(channel_url: str) -> list[str]:
    """Return list of video_ids already processed for this channel."""
    res = (
        _get_client()
        .table("processed_videos")
        .select("video_id")
        .eq("channel_url", channel_url)
        .execute()
    )
    return [r["video_id"] for r in (res.data or [])]


async def mark_video_processed(channel_url: str, video_id: str, video_title: str):
    _get_client().table("processed_videos").upsert({
        "channel_url": channel_url,
        "video_id":    video_id,
        "video_title": video_title,
    }).execute()
