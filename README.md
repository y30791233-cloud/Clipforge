# ClipForge 1080p Backend

A small Flask + yt-dlp + FFmpeg backend and mobile-friendly web UI. Video mode requests the best available video/audio streams at or below the selected maximum resolution (up to 1080p), merges them to MP4 where supported, then sends the result to the browser. Audio mode extracts MP3.

## Important limits
- 1080p is a maximum requested resolution, not a guarantee. The source must contain 1080p.
- This is a server-side downloader, not a browser-only/private-local processor. The hosting server processes the URL and file.
- Use only videos you own or have permission to download, and comply with the source platform's terms and copyright law.
- Private, DRM-protected, login-only and age-restricted content may fail.
- Free hosting may have strict RAM, disk, bandwidth, execution timeout, or outbound network restrictions. Large 1080p downloads may fail.
- YouTube and other platforms may change their systems, so yt-dlp may need updates.
- Do not expose this publicly without rate limits, job limits, abuse protection, and a clear acceptable-use policy. This demo serializes jobs but is not hardened for public production use.

## Deploy with Render (mobile browser)
1. Create a GitHub repository.
2. Upload all files and folders from this project; `app.py` and `Dockerfile` must be at repository root.
3. In Render, create a new **Web Service** from the repository and select Docker runtime. Or use the included `render.yaml` Blueprint.
4. Deploy and wait for the build. Open the service URL.
5. Paste a permitted video URL, select **1080p**, and tap Download.

## Run locally
Install Python 3.11+, FFmpeg, then:
```bash
pip install -r requirements.txt
python app.py
```
Open http://127.0.0.1:8080

## Security note
Do not use this as an open public URL-to-file proxy. Restrict allowed domains, add authentication/rate limiting, and set download size/time limits before public deployment.
