import os
import re
import tempfile
import threading
from flask import Flask, render_template, request, send_file, jsonify, after_this_request
import yt_dlp

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024

# Simple in-memory lock: avoids multiple heavy FFmpeg jobs at once on small hosting.
download_lock = threading.Lock()

ALLOWED_QUALITIES = {360, 480, 720, 1080}

def clean_title(value):
    value = re.sub(r'[\\/:*?"<>|]+', "_", value or "video")
    return value[:100].strip(" ._") or "video"

@app.get("/")
def index():
    return render_template("index.html")

@app.post("/api/download")
def download():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    kind = data.get("kind", "video")
    try:
        quality = int(data.get("quality", 1080))
    except (TypeError, ValueError):
        quality = 1080

    if not url or not re.match(r"^https?://", url, re.I):
        return jsonify(error="Valid video URL paste करा."), 400
    if quality not in ALLOWED_QUALITIES:
        return jsonify(error="Quality 360p, 480p, 720p किंवा 1080p निवडा."), 400
    if kind not in ("video", "audio"):
        return jsonify(error="Output mode invalid आहे."), 400

    if not download_lock.acquire(blocking=False):
        return jsonify(error="Server वर दुसरा download चालू आहे. थोड्या वेळाने पुन्हा प्रयत्न करा."), 429

    tempdir = tempfile.mkdtemp(prefix="clipforge_")
    try:
        output_template = os.path.join(tempdir, "%(title).100s.%(ext)s")
        if kind == "audio":
            format_selector = "ba/b"
            postprocessors = [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }]
        else:
            # Select best video at or below requested height, plus best audio.
            # If source has a combined format, fallback to it.
            format_selector = (
                f"bv*[height<={quality}]+ba/"
                f"b[height<={quality}]/"
                f"bv*+ba/b"
            )
            postprocessors = [{
                "key": "FFmpegVideoRemuxer",
                "preferedformat": "mp4",
            }]

        options = {
            "format": format_selector,
            "outtmpl": output_template,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "merge_output_format": "mp4" if kind == "video" else None,
            "postprocessors": postprocessors,
            "restrictfilenames": True,
            "socket_timeout": 25,
            "retries": 2,
        }
        # yt-dlp/FFmpeg work is CPU/RAM intensive; hosting limits apply.
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=True)
            title = clean_title(info.get("title"))
            prepared = ydl.prepare_filename(info)
            root, _ = os.path.splitext(prepared)
            candidates = [prepared, root + ".mp4", root + ".mp3", root + ".m4a", root + ".webm"]
            final_path = next((p for p in candidates if os.path.isfile(p)), None)
            if not final_path:
                # Find actual postprocessed output if extension differs.
                matches = [os.path.join(tempdir, n) for n in os.listdir(tempdir) if os.path.isfile(os.path.join(tempdir, n))]
                final_path = matches[0] if matches else None
            if not final_path:
                raise RuntimeError("Downloaded file तयार झाली नाही.")

        download_name = title + (".mp3" if kind == "audio" else ".mp4")

        @after_this_request
        def cleanup(response):
            # Flask sends the file before cleanup; close then remove temp directory.
            try:
                response.call_on_close(lambda: shutil.rmtree(tempdir, ignore_errors=True))
            finally:
                download_lock.release()
            return response

        return send_file(final_path, as_attachment=True, download_name=download_name)
    except Exception as exc:
        shutil.rmtree(tempdir, ignore_errors=True)
        download_lock.release()
        message = str(exc)
        if "Private video" in message or "Sign in" in message:
            message = "हा video private/login-protected आहे; backend तो access करू शकत नाही."
        elif "Unsupported URL" in message:
            message = "हा URL supported video link नाही."
        return jsonify(error=message[:500]), 400

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
