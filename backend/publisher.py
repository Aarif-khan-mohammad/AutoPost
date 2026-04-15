import os
import requests
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from dotenv import load_dotenv

load_dotenv()


def _get_youtube_creds() -> Credentials:
    """
    Build credentials from stored refresh token in .env.
    Auto-refreshes the access token — never expires.
    """
    creds = Credentials(
        token         = None,
        refresh_token = os.getenv("YOUTUBE_REFRESH_TOKEN"),
        client_id     = os.getenv("YOUTUBE_CLIENT_ID"),
        client_secret = os.getenv("YOUTUBE_CLIENT_SECRET"),
        token_uri     = "https://oauth2.googleapis.com/token",
    )
    creds.refresh(Request())   # get a fresh access token automatically
    return creds


def publish_to_youtube(
    video_path: str,
    caption: str,
    hashtags: list[str],
    access_token: str | None = None,
) -> str:
    # User token takes priority — if provided, post to their channel
    if access_token:
        creds = Credentials(token=access_token)
    elif os.getenv("YOUTUBE_REFRESH_TOKEN"):
        creds = _get_youtube_creds()
    else:
        raise ValueError("No YouTube credentials. Run get_youtube_token.py first.")

    youtube = build("youtube", "v3", credentials=creds)

    tag_str = " ".join(f"#{t}" for t in hashtags)
    # Title must contain #Shorts for YouTube Shorts feed distribution
    # Keep title punchy and under 60 chars for mobile display
    title = caption[:97] + " #Shorts" if len(caption) <= 92 else caption[:92] + "... #Shorts"

    # Description optimized for discovery:
    # - Hook line first (caption)
    # - Hashtags for search
    # - #Shorts mandatory for feed
    # - Call to action
    description = (
        f"{caption}\n\n"
        f"{tag_str} #Shorts #viral #trending #fyp\n\n"
        f"Like & Subscribe for more! 🔔"
    )

    body = {
        "snippet": {
            "title":          title,
            "description":    description,
            "tags":           hashtags + ["Shorts", "viral", "trending", "fyp", "youtube shorts"],
            "categoryId":     "24",  # Entertainment — best for Shorts discovery
            "defaultLanguage": "en",
        },
        "status": {
            "privacyStatus":           "public",
            "selfDeclaredMadeForKids": False,
            "madeForKids":             False,
        },
    }

    media   = MediaFileUpload(video_path, mimetype="video/mp4", resumable=True)
    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)

    response = None
    while response is None:
        _, response = request.next_chunk()

    return f"https://youtube.com/shorts/{response['id']}"


def publish_to_instagram(
    video_path: str,
    caption: str,
    hashtags: list[str],
    access_token: str,
    ig_user_id: str,
) -> str:
    public_video_url = _upload_to_public_storage(video_path)
    tag_str      = " ".join(f"#{t}" for t in hashtags)
    full_caption = f"{caption}\n\n{tag_str}"
    base         = "https://graph.facebook.com/v19.0"

    r = requests.post(f"{base}/{ig_user_id}/media", params={
        "media_type": "REELS", "video_url": public_video_url,
        "caption": full_caption, "access_token": access_token,
    })
    r.raise_for_status()

    r = requests.post(f"{base}/{ig_user_id}/media_publish", params={
        "creation_id": r.json()["id"], "access_token": access_token,
    })
    r.raise_for_status()
    return r.json()["id"]


def _upload_to_public_storage(video_path: str) -> str:
    raise NotImplementedError(
        "Implement _upload_to_public_storage() to return a public video URL."
    )


def get_my_shorts_stats(limit: int = 5, access_token: str | None = None) -> list[dict]:
    """Fetch latest Shorts from my channel with view counts."""
    if access_token:
        creds = Credentials(token=access_token)
    elif os.getenv("YOUTUBE_REFRESH_TOKEN"):
        creds = _get_youtube_creds()
    else:
        raise ValueError("No YouTube credentials")

    youtube = build("youtube", "v3", credentials=creds)

    # Get my channel's uploads playlist
    ch = youtube.channels().list(part="contentDetails", mine=True).execute()
    uploads_id = ch["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]

    # Get latest videos
    pl = youtube.playlistItems().list(
        part="snippet", playlistId=uploads_id, maxResults=20
    ).execute()

    video_ids = [item["snippet"]["resourceId"]["videoId"] for item in pl.get("items", [])]
    if not video_ids:
        return []

    # Get stats for all videos
    stats_res = youtube.videos().list(
        part="snippet,statistics,contentDetails",
        id=",".join(video_ids)
    ).execute()

    shorts = []
    for item in stats_res.get("items", []):
        duration = item["contentDetails"]["duration"]  # e.g. PT58S
        # Parse ISO 8601 duration — Shorts are <= 60s
        import re
        secs = 0
        m = re.search(r"(\d+)M", duration)
        s = re.search(r"(\d+)S", duration)
        if m: secs += int(m.group(1)) * 60
        if s: secs += int(s.group(1))
        if secs > 60:
            continue  # skip long videos

        stats = item.get("statistics", {})
        shorts.append({
            "video_id":    item["id"],
            "title":       item["snippet"]["title"],
            "url":         f"https://youtube.com/shorts/{item['id']}",
            "views":       int(stats.get("viewCount", 0)),
            "likes":       int(stats.get("likeCount", 0)),
            "comments":    int(stats.get("commentCount", 0)),
            "duration":    secs,
            "published_at": item["snippet"]["publishedAt"],
            "thumbnail":   item["snippet"]["thumbnails"].get("medium", {}).get("url", ""),
            "description": item["snippet"].get("description", ""),
            "tags":        item["snippet"].get("tags", []),
        })
        if len(shorts) >= limit:
            break

    return shorts


def delete_youtube_video(video_id: str, access_token: str | None = None):
    """Delete a video from YouTube."""
    if access_token:
        creds = Credentials(token=access_token)
    elif os.getenv("YOUTUBE_REFRESH_TOKEN"):
        creds = _get_youtube_creds()
    else:
        raise ValueError("No YouTube credentials")
    youtube = build("youtube", "v3", credentials=creds)
    youtube.videos().delete(id=video_id).execute()
