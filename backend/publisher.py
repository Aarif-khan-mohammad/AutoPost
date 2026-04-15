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
