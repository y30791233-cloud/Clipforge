const $ = id => document.getElementById(id);
const kind = $("kind");
const qualityBox = $("qualityBox");
const button = $("go");
const status = $("status");
const result = $("result");

kind.addEventListener("change", () => {
  qualityBox.hidden = kind.value === "audio";
});

button.addEventListener("click", async () => {
  const url = $("url").value.trim();
  result.hidden = true;
  result.removeAttribute("href");
  if (!url) {
    status.textContent = "आधी video link paste करा.";
    return;
  }
  button.disabled = true;
  status.textContent = "Request सुरू आहे. Video size आणि server वर अवलंबून वेळ लागू शकतो...";
  try {
    const response = await fetch("/api/download", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        url,
        kind: kind.value,
        quality: Number($("quality").value)
      })
    });
    if (!response.ok) {
      let message = "Download request failed.";
      try { message = (await response.json()).error || message; } catch {}
      throw new Error(message);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^";]+)"?/i);
    result.href = objectUrl;
    result.download = match ? match[1] : (kind.value === "audio" ? "clipforge.mp3" : "clipforge.mp4");
    result.textContent = "Tap here to save downloaded file";
    result.hidden = false;
    status.textContent = `Download तयार. File size: ${(blob.size / 1024 / 1024).toFixed(1)} MB`;
  } catch (error) {
    status.textContent = "Error: " + (error.message || "Download failed");
  } finally {
    button.disabled = false;
  }
});
