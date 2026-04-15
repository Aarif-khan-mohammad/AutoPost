import os
import re
import time
import base64
import logging
import subprocess
import tempfile
import urllib.parse
import yt_dlp
import imageio_ffmpeg
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("autopost")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    force=True,
)

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


def _get_cookies_file() -> str | None:
    """Write YOUTUBE_COOKIES_B64 env var to a temp file and return its path."""
    b64 = os.getenv("YOUTUBE_COOKIES_B64", "").strip()
    if not b64:
        return None
    try:
        b64_clean = re.sub(r"-{5}.*?-{5}", "", b64)
        b64_clean = re.sub(r"\s+", "", b64_clean)
        data = base64.b64decode(b64_clean)
        tmp  = tempfile.NamedTemporaryFile(delete=False, suffix=".txt", mode="wb")
        tmp.write(data)
        tmp.close()
        log.info(f"[slicer] Loaded cookies from YOUTUBE_COOKIES_B64 ({len(data)} bytes)")
        return tmp.name
    except Exception as e:
        log.warning(f"[slicer] Failed to decode cookies: {e}")
        return None


def _get_oauth_token() -> str | None:
    """Get a fresh access token from the stored refresh token."""
    refresh_token = os.getenv("YOUTUBE_REFRESH_TOKEN", "").strip()
    client_id     = os.getenv("YOUTUBE_CLIENT_ID", "").strip()
    client_secret = os.getenv("YOUTUBE_CLIENT_SECRET", "").strip()
    if not all([refresh_token, client_id, client_secret]):
        return None
    try:
        import urllib.request, json as _json
        data = urllib.parse.urlencode({
            "client_id":     client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type":    "refresh_token",
        }).encode()
        req  = urllib.request.Request("https://oauth2.googleapis.com/token", data=data)
        resp = urllib.request.urlopen(req, timeout=10)
        token = _json.loads(resp.read())["access_token"]
        log.info("[slicer] Got fresh OAuth access token")
        return token
    except Exception as e:
        log.warning(f"[slicer] OAuth token refresh failed: {e}")
        return None


# ── 1. Pick next video from channel not yet processed ────────────────────────

def get_next_video(channel_url: str, already_used: list[str]) -> dict:
    """
    Scans channel /videos tab via yt-dlp subprocess.
    Filters videos <= 60s (Shorts), picks most recent unprocessed.
    """
    import sys as _sys
    import tempfile as _tmp

    base_url = channel_url.rstrip("/")
    candidates = []

    try:
        log.info(f"[slicer] Scanning channel: {base_url}")
        # Scan both /shorts and /videos tabs to cover all cases
        for tab in ["/shorts", "/videos"]:
            with _tmp.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
                tmp_path = f.name

            subprocess.call(
                [
                    _sys.executable, "-m", "yt_dlp",
                    "--flat-playlist",
                    "--print", "%(id)s|%(duration)s|%(title)s",
                    "--playlist-end", "30",
                    "--quiet",
                    base_url + tab,
                ],
                stdout=open(tmp_path, "w"),
                stderr=subprocess.DEVNULL,
            )

            with open(tmp_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.read().strip().splitlines()
            os.unlink(tmp_path)

            log.info(f"[slicer] {tab}: {len(lines)} lines")

            seen = {c["video_id"] for c in candidates}
            for line in lines:
                parts = line.split("|", 2)
                if len(parts) < 2:
                    continue
                vid_id = parts[0].strip()
                try:
                    duration = float(parts[1].strip() or 0)
                except ValueError:
                    duration = 0
                title = parts[2].strip() if len(parts) > 2 else ""
                # /shorts tab: duration is NA — anything there is a Short by definition
                # /videos tab: only include if duration <= 60
                if vid_id and vid_id not in already_used and vid_id not in seen:
                    if tab == "/shorts" or (0 < duration <= 60):
                        candidates.append({
                            "video_id": vid_id,
                            "url":      f"https://www.youtube.com/watch?v={vid_id}",
                            "title":    title,
                            "duration": int(duration) if duration > 0 else 60,
                            "timestamp": 0,
                        })

        log.info(f"[slicer] Found {len(candidates)} unprocessed short(s) (<= 60s)")

    except Exception as e:
        log.warning(f"[slicer] Channel scan error: {e}")

    if not candidates:
        raise RuntimeError("No new shorts found — all recent uploads already processed.")

    # Sort newest first, pick today's if available else most recent
    from datetime import datetime, timezone
    candidates.sort(key=lambda v: v["timestamp"], reverse=True)
    today = datetime.now(timezone.utc).date()
    todays = [
        v for v in candidates
        if v["timestamp"] and datetime.fromtimestamp(v["timestamp"], tz=timezone.utc).date() == today
    ]
    chosen = todays[0] if todays else candidates[0]
    upload_date = (
        datetime.fromtimestamp(chosen["timestamp"], tz=timezone.utc).date()
        if chosen["timestamp"] else "unknown"
    )
    log.info(f"[slicer] Selected: '{chosen['title']}' ({chosen['duration']}s) uploaded={upload_date} — {chosen['url']}")
    return chosen


# ── 2. Download full video ────────────────────────────────────────────────────

_DOWNLOAD_ATTEMPTS = [
    ("android_vr", "18/best[height<=720]"),
    ("android",    "18/best[height<=720]"),
    ("mweb",       "18/best[height<=720]"),
    ("web",        "18/best[height<=720]"),
]


def download_video(video_url: str, job_id: str) -> str:
    out   = os.path.join(DOWNLOADS_DIR, f"{job_id}_source.mp4")
    proxy = os.getenv("YTDLP_PROXY", "").strip() or None
    # Use Tor if no proxy configured and Tor is running
    if not proxy:
        import socket
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(2)
            s.connect(("127.0.0.1", 9050))
            s.close()
            proxy = "socks5://127.0.0.1:9050"
            log.info("[slicer] Using Tor proxy on port 9050")
        except Exception as tor_err:
            log.warning(f"[slicer] Tor not available: {tor_err}")
    if proxy:
        log.info(f"[slicer] Proxy set: {proxy[:40]}")
    token = _get_oauth_token()
    if os.path.exists(out):
        os.remove(out)

    base = {
        "outtmpl":             out,
        "merge_output_format": "mp4",
        "quiet":               False,
        "noplaylist":          True,
        "socket_timeout":      60,
        "retries":             3,
        "http_headers":        _YT_HEADERS,
        "ffmpeg_location":     os.path.dirname(FFMPEG),
    }
    if proxy:
        base["proxy"] = proxy
        log.info(f"[slicer] Using proxy: {proxy[:40]}...")

    for client, fmt in _DOWNLOAD_ATTEMPTS:
        try:
            log.info(f"[slicer] Trying {client} client: {video_url}")
            opts = {
                **base,
                "format": fmt,
                "extractor_args": {"youtube": {"player_client": [client]}},
            }
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([video_url])
            if os.path.exists(out) and os.path.getsize(out) > 10_000:
                log.info(f"[slicer] Download OK via {client} ({os.path.getsize(out) // 1024 // 1024} MB)")
                return out
        except Exception as e:
            log.warning(f"[slicer] {client} failed: {e}")
        if os.path.exists(out):
            os.remove(out)
        time.sleep(3)

    raise RuntimeError(f"Could not download: {video_url}")


# ── 3. Gemini — find best 60s in the full video ───────────────────────────────

def analyze_with_gemini(video_path: str, duration: int, platform: str = "youtube") -> tuple[float, str, list[str]]:
    models_to_try = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.0-flash"]
    for model_name in models_to_try:
        try:
            return _call_gemini(model_name, video_path, duration, platform)
        except Exception as e:
            msg = str(e)
            if "429" in msg or "quota" in msg.lower():
                log.warning(f"[slicer] Gemini {model_name} quota exceeded, trying next...")
                continue
            raise
    raise RuntimeError("All Gemini models quota exceeded. Wait a minute and retry.")


def _call_gemini(model_name: str, video_path: str, duration: int, platform: str = "youtube") -> tuple[float, str, list[str]]:
    model = genai.GenerativeModel(model_name)
    log.info(f"[slicer] Uploading to Gemini ({model_name}), duration={duration}s platform={platform}")

    # Retry upload up to 3 times for network errors
    video_file = None
    for attempt in range(3):
        try:
            video_file = genai.upload_file(path=video_path, mime_type="video/mp4")
            break
        except Exception as e:
            log.warning(f"[slicer] Gemini upload attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(5)
            else:
                raise

    for _ in range(30):
        video_file = genai.get_file(video_file.name)
        if video_file.state.name == "ACTIVE":
            break
        time.sleep(4)
    else:
        raise RuntimeError("Gemini file never became ACTIVE.")

    is_short  = duration <= 60
    max_start = max(0, duration - CLIP_DURATION)

    platform_context = (
        """YouTube Shorts algorithm (2024-2025):
- Hook MUST grab attention in first 0.5 seconds
- Title with #Shorts gets pushed to Shorts feed and suggested videos
- High retention (watch full video) = more distribution to new audiences
- Trending topics + strong emotions = viral potential
- Caption should create curiosity gap or strong emotion"""
        if platform == "youtube" else
        """Instagram Reels algorithm (2024-2025):
- First frame must be visually striking - no black frames
- Emotional reactions (shock, laugh, awe) get shared more
- 3-5 hashtags perform better than 30 hashtags
- Caption with question or CTA boosts comments and reach
- Reels shown to non-followers if engagement rate is high"""
    )

    # Extract creator/channel name from video path for context
    channel_hint = os.path.basename(video_path).split("_")[0]

    # Load optimization hints from last analytics run
    try:
        from main import _optimization_hints
        hints_text = ("\n\nPrevious performance insights to apply:\n" + "\n".join(_optimization_hints)) if _optimization_hints else ""
    except Exception:
        hints_text = ""

    if is_short:
        prompt = f"""You are a viral YouTube Shorts growth expert. Analyze this short-form video carefully.
{platform_context}

Your job: write a title + caption that makes people STOP scrolling and click.
Rules:
- Mention the creator's name or recognizable people visible in the video
- Use a curiosity gap or cliffhanger (e.g. "...and then this happened", "nobody expected this")
- Include an emotion word (shocked, insane, crazy, hilarious, unbelievable)
- Keep caption under 120 chars, no hashtags in caption
- Hashtags: 3 niche creator/topic tags + 2 broad tags (e.g. #MrBeast #IShowSpeed not #viral #trending)

Reply EXACTLY in this format (no extra text):
START_TIME: 0
CAPTION: <title with creator name + curiosity gap + emotion>
HASHTAGS: <tag1>, <tag2>, <tag3>, <tag4>, <tag5>"""
    else:
        prompt = f"""You are a viral YouTube Shorts growth expert. Analyze this video carefully.
{platform_context}
This video is {duration} seconds long. Find the single BEST {CLIP_DURATION}-second segment.{hints_text}

Prioritize segments with: peak emotional reaction, surprising moment, creator doing something unexpected, funny/shocking outcome.
Avoid: intros, outros, sponsor segments, slow talking parts.

For the caption:
- Mention the creator's name or recognizable people in that segment
- Use a curiosity gap or cliffhanger
- Include an emotion word (shocked, insane, crazy, hilarious, unbelievable)
- Keep under 120 chars, no hashtags
- Hashtags: 3 niche creator/topic tags + 2 broad tags (NOT #viral #trending #fyp — those are dead)

Reply EXACTLY in this format (no extra text):
START_TIME: <integer seconds, 0-{max_start}>
CAPTION: <title with creator name + curiosity gap + emotion>
HASHTAGS: <tag1>, <tag2>, <tag3>, <tag4>, <tag5>"""

    response = model.generate_content([video_file, prompt])
    text = response.text.strip()
    log.info(f"[slicer] Gemini response: {text}")

    start_time = 0.0
    caption    = "You need to see this 🔥"
    hashtags   = ["viral", "trending", "shorts", platform, "fyp"]

    if m := re.search(r"START_TIME:\s*(\d+(?:\.\d+)?)", text):
        start_time = float(m.group(1))
    if m := re.search(r"CAPTION:\s*(.+)", text):
        caption = m.group(1).strip()
    if m := re.search(r"HASHTAGS:\s*(.+)", text):
        hashtags = [h.strip().lstrip("#") for h in m.group(1).split(",")]

    log.info(f"[slicer] Parsed — start={start_time}s caption='{caption}'")
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
    log.info(f"[slicer] Running ffmpeg crop: start={start}s output={out}")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{r.stderr[-800:]}")
    log.info(f"[slicer] ffmpeg done: {os.path.getsize(out) // 1024} KB")
    return out


# ── Public entry point ────────────────────────────────────────────────────────

def process_channel(
    channel_url: str,
    job_id: str,
    already_used: list[str],
    on_step=None,
    platform: str = "youtube",
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
    log.info(f"[slicer] Processing ({'Short' if is_short else 'video'}): '{video_info['title']}' ({video_info['duration']}s)")

    source = download_video(video_info["url"], job_id)

    step("analyzing")
    if is_short:
        start, caption, hashtags = 0.0, *analyze_with_gemini(source, video_info["duration"], platform)[1:]
    else:
        start, caption, hashtags = analyze_with_gemini(source, video_info["duration"], platform)

    step("slicing")
    output = export_vertical(source, start, job_id)
    os.remove(source)

    return output, caption, hashtags, video_info
