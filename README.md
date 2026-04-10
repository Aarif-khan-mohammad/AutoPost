# AutoPost – AI Video Repurposing

Paste a YouTube/Instagram URL → Gemini finds the best 60s moment → crops to 9:16 → posts to YouTube Shorts & Instagram Reels.

## Project Structure

```
AutoPost/
├── backend/          # FastAPI + Python processing
│   ├── main.py       # API routes & pipeline orchestration
│   ├── slicer.py     # yt-dlp download + Gemini analysis + MoviePy crop
│   ├── publisher.py  # YouTube Data API + Instagram Graph API
│   ├── database.py   # Supabase job tracking
│   └── requirements.txt
└── frontend/         # Next.js 14 App Router
    ├── app/
    │   ├── page.tsx
    │   ├── layout.tsx
    │   └── api/
    │       ├── process/route.ts      # POST /api/process
    │       └── jobs/[job_id]/route.ts # GET /api/jobs/:id
    └── components/
        └── JobForm.tsx
```

## Prerequisites

- Python 3.11+
- Node.js 18+
- [Supabase](https://supabase.com) project (free tier)
- [Gemini API key](https://aistudio.google.com/app/apikey) (free tier)
- Google Cloud Project with YouTube Data API v3 enabled
- Meta Developer App with Instagram Graph API access

## Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt

cp .env.example .env         # fill in your keys
uvicorn main:app --reload --port 8000
```

### Supabase Table

Run once in your Supabase SQL editor:

```sql
create table if not exists jobs (
  id text primary key,
  source_url text,
  status text default 'queued',
  step text,
  results jsonb,
  created_at timestamptz default now()
);
```

## Frontend Setup

```bash
cd frontend
npm install
cp .env.local.example .env.local   # set BACKEND_URL
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Pipeline Flow

```
User submits URL
      │
      ▼
FastAPI creates job (Supabase) → returns job_id
      │
      ▼  (background task)
yt-dlp downloads video (720p)
      │
      ▼
Gemini 1.5 Flash analyzes → best start_time + caption + hashtags
      │
      ▼
MoviePy: subclip → center-crop → resize 1080×1920 → export MP4
      │
      ▼
YouTube Data API  →  upload as Short
Instagram Graph API → upload as Reel
      │
      ▼
Job status → "done" (frontend polls every 3s)
```

## Important Notes

- **Instagram** requires a publicly accessible video URL. Implement `_upload_to_public_storage()` in `publisher.py` (e.g., S3, GCS, Cloudinary).
- OAuth tokens are passed per-request for simplicity. In production, store them encrypted in Supabase and refresh automatically.
- `downloads/` directory is created automatically; add it to `.gitignore`.
