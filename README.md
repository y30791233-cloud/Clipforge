# ClipForge

ClipForge is a privacy-focused, browser-side video trimmer and audio extractor built with HTML, CSS, vanilla JavaScript, and FFmpeg WebAssembly.

## What works

- Select a local media file, or fetch a **direct media file URL** that permits browser CORS access.
- Preview media using the browser's HTML5 video player.
- Trim with HH:MM:SS fields and draggable start/end range controls.
- Export a selected segment to MP4 (H.264/AAC), WebM (VP9/Opus), or MOV (H.264/AAC) where the FFmpeg build includes those encoders.
- Extract audio to MP3, M4A, AAC, WAV, OGG, or FLAC where encoders are available.
- Choose output resolution no higher than the detected source height.
- View progress, duration and approximate output size; download the generated Blob.
- Cancel a running FFmpeg job and clear the output object URL.

## Important limits

This is a frontend-only tool, not a universal video-site downloader. It does not extract media from YouTube, social-media pages, protected streaming services, or DRM. A direct URL must be reachable by browser `fetch()` with CORS. Local files are the most reliable input.

FFmpeg WebAssembly has limited memory compared with desktop FFmpeg. Large/high-resolution files may fail or exhaust browser memory. Input media and generated output are held temporarily in browser memory; object URLs are revoked when cleared or when the page is closed. This does not make browser memory perfectly secure, and the browser may maintain its own ordinary network/cache state.

The application does not intentionally upload user media or URLs to an application server. It downloads the FFmpeg JavaScript/WASM engine from unpkg on first processing, and loads Google Fonts from Google Fonts CSS. If you need a fully offline deployment, self-host these open-source assets and replace the CDN imports/URLs in `script.js` and `style.css`.

## Run locally

ES modules and FFmpeg worker/WASM loading require a local HTTP server. Do not open `index.html` directly as a `file://` URL.

### Python
```bash
python -m http.server 8000
```
Then visit http://localhost:8000

### Node (if installed)
```bash
npx serve .
```

No API key, account, backend, database, or build step is required. An internet connection is needed the first time to load FFmpeg assets (unless you self-host them).

## Project files

- `index.html` — accessible application layout
- `style.css` — responsive dark UI and optional light theme
- `script.js` — URL/local loading, trim UI, FFmpeg processing and downloads

## Encoder notes

FFmpeg core builds can differ. If a selected codec is absent, FFmpeg returns a real error and the app shows it; it does not fabricate an output. The browser's preview codec support is also independent of FFmpeg encoder support.
