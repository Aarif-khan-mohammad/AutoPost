import os
import re
import time
import subprocess
import yt_dlp
import imageio_ffmpeg
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
DOWNLOADS_DIR = os.getenv("DOWNLOADS_DIR", "/tmp/autopost_downloads")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

CLIP_DURATION = 60
FFMPEG        = imageio_ffmpeg.get_ffmpeg_exe()

_YT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
}


# ── 1. Pick next video from channel not yet processed ────────────────────────

def get_next_video(channel_url: str, already_used: list[str]) -> dict:
    """
    Check /shorts tab first, then main uploads.
    Returns first video not in already_used.
    No duration filter — accepts both Shorts and regular videos.
    """
    base_url   = channel_url.rstrip("/")
    feeds      = [base_url + "/shorts", base_url]
    candidates = []

    for feed in feeds:
        opts = {
            "quiet": True,
            "extract_flat": "in_playlist",
            "playlistend": 20,
            "noplaylist": False,
            "extractor_args": {"youtube": {"player_client": ["web"]}},
            "http_headers": _YT_HEADERS,
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(feed, download=False)
            for entry in (info.get("entries") or []):
                vid_id = entry.get("id", "")
                if vid_id and vid_id not in already_used:
                    candidates.append({
                        "video_id": vid_id,
                        "url":      f"https://www.youtube.com/watch?v={vid_id}",
                        "title":    entry.get("title", ""),
                        "duration": int(entry.get("duration") or 0),
                    })
        except Exception as e:
            print(f"[channel] Feed {feed} error: {e}")

        if candidates:
            break  # found results in this feed, stop

    if not candidates:
        raise RuntimeError(
            "No new videos found — all recent uploads already processed."
        )

    # Prefer Shorts (<=60s), fall back to any video
    shorts = [v for v in candidates if 0 < v["duration"] <= 60]
    return shorts[0] if shorts else candidates[0]


# ── 2. Download full video ────────────────────────────────────────────────────

def download_video(video_url: str, job_id: str) -> str:
    out = os.path.join(DOWNLOADS_DIR, f"{job_id}_source.mp4")
    if os.path.exists(out):
        os.remove(out)

    base = {
        "outtmpl": out,
        "merge_output_format": "mp4",
        "quiet": False,
        "noplaylist": True,
        "socket_timeout": 30,
        "retries": 3,
        "http_headers": _YT_HEADERS,
        "ffmpeg_location": os.path.dirname(FFMPEG),
    }

    # Attempt 1 — android_vr client: bypasses n-challenge, gets all formats
    try:
        print("[yt-dlp] Downloading via android_vr client...")
        opts = {
            **base,
            "format": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
            "extractor_args": {"youtube": {"player_client": ["android_vr"]}},
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([video_url])
        if os.path.exists(out) and os.path.getsize(out) > 10_000:
            print("[yt-dlp] android_vr succeeded.")
            return out
    except Exception as e:
        print(f"[yt-dlp] android_vr failed: {e}")
    if os.path.exists(out):
        os.remove(out)

    # Attempt 2 — web client fallback
    try:
        print("[yt-dlp] Falling back to web client...")
        opts = {
            **base,
            "format": "bestvideo[height<=720]+bestaudio/best[height<=720]/18/best",
            "extractor_args": {"youtube": {"player_client": ["web"]}},
            "ignore_no_formats_error": True,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([video_url])
        if os.path.exists(out) and os.path.getsize(out) > 10_000:
            print("[yt-dlp] web client succeeded.")
            return out
    except Exception as e:
        print(f"[yt-dlp] web client failed: {e}")

    raise RuntimeError(f"Could not download: {video_url}")


# ── 3. Gemini — find best 60s in the full video ───────────────────────────────

def analyze_with_gemini(video_path: str, duration: int) -> tuple[float, str, list[str]]:
    # Try models in order — each has its own free-tier quota
    models_to_try = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.0-flash"]

    for model_name in models_to_try:
        try:
            return _call_gemini(model_name, video_path, duration)
        except Exception as e:
            msg = str(e)
            if "429" in msg or "quota" in msg.lower():
                print(f"[Gemini] {model_name} quota exceeded, trying next model...")
                continue
            raise  # non-quota error — re-raise immediately

    raise RuntimeError("All Gemini models quota exceeded. Wait a minute and retry.")


def _call_gemini(model_name: str, video_path: str, duration: int) -> tuple[float, str, list[str]]:
    model = genai.GenerativeModel(model_name)
    print(f"[Gemini] Uploading video via {model_name}...")
    video_file = genai.upload_file(path=video_path, mime_type="video/mp4")

    for _ in range(30):
        video_file = genai.get_file(video_file.name)
        if video_file.state.name == "ACTIVE":
            break
        time.sleep(4)
    else:
        raise RuntimeError("Gemini file never became ACTIVE.")

    is_short  = duration <= 60
    max_start = max(0, duration - CLIP_DURATION)

    if is_short:
        prompt = """This is a YouTube Short. Generate a viral caption and hashtags for it.

Reply EXACTLY in this format (no extra text):
START_TIME: 0
CAPTION: <catchy caption under 150 chars, no hashtags>
HASHTAGS: <tag1>, <tag2>, <tag3>, <tag4>"""
    else:
        prompt = f"""You are a viral short-form content editor.
This video is {duration} seconds long.
Find the single BEST {CLIP_DURATION}-second segment to post as a YouTube Short.
Prioritize: strong hook in first 3 seconds, high energy, emotion, or surprise.
Avoid intros, outros, sponsor segments, and slow parts.

Reply EXACTLY in this format (no extra text):
START_TIME: <integer seconds, 0-{max_start}>
CAPTION: <catchy caption under 150 chars, no hashtags>
HASHTAGS: <tag1>, <tag2>, <tag3>, <tag4>"""

    response = model.generate_content([video_file, prompt])
    text = response.text.strip()
    print(f"[Gemini] {text}")

    start_time = 0.0
    caption    = "You need to see this 🔥"
    hashtags   = ["viral", "trending", "shorts", "youtube"]

    if m := re.search(r"START_TIME:\s*(\d+(?:\.\d+)?)", text):
        start_time = float(m.group(1))
    if m := re.search(r"CAPTION:\s*(.+)", text):
        caption = m.group(1).strip()
    if m := re.search(r"HASHTAGS:\s*(.+)", text):
        hashtags = [h.strip().lstrip("#") for h in m.group(1).split(",")]

    return min(max(0.0, start_time), float(max_start)), caption, hashtags


# ── 4. ffmpeg — trim + crop to 1080×1920 ─────────────────────────────────────

def export_vertical(source: str, start: float, job_id: str) -> str:
    out = os.path.join(DOWNLOADS_DIR, f"{job_id}_output.mp4")
    # scale width to 1080, pad height to 1920 (handles any input resolution)
    vf  = "scale=1080:-2,pad=1080:1920:0:(1920-ih)/2:black"
    cmd = [
        FFMPEG, "-y",
        "-ss", str(start), "-i", source, "-t", str(CLIP_DURATION),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart", out,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{r.stderr[-800:]}")
    return out


# ── Public entry point ────────────────────────────────────────────────────────

def process_channel(
    channel_url: str,
    job_id: str,
    already_used: list[str],
    on_step=None,
) -> tuple[str, str, list[str], dict]:
    """
    1. Pick next unprocessed video from channel
    2. Download it fully
    3. Gemini picks best 60s
    4. Export 1080×1920
    Returns (output_path, caption, hashtags, video_info)
    """
    def step(name):
        if on_step:
            on_step(name)

    step("downloading")
    video_info = get_next_video(channel_url, already_used)
    is_short   = video_info["duration"] <= 60
    print(f"[pipeline] Selected ({'Short' if is_short else 'video'}): {video_info['title']} ({video_info['duration']}s)")

    source = download_video(video_info["url"], job_id)

    step("analyzing")
    if is_short:
        # Already a Short — use full clip, still generate caption/hashtags
        start, caption, hashtags = 0.0, *analyze_with_gemini(source, video_info["duration"])[1:]
    else:
        start, caption, hashtags = analyze_with_gemini(source, video_info["duration"])

    step("slicing")
    output = export_vertical(source, start, job_id)
    os.remove(source)

    return output, caption, hashtags, video_info
