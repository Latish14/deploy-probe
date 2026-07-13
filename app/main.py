import os
import platform
import socket
import time
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

APP_START_TIME = time.time()
BOOT_ID = os.urandom(4).hex()

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Deploy Probe", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_request_lock = Lock()
_request_count = 0


def _bump_counter() -> int:
    global _request_count
    with _request_lock:
        _request_count += 1
        return _request_count


@app.get("/api/ping")
def ping():
    """Cheap round-trip endpoint the frontend hits repeatedly to gauge
    connection quality. Kept tiny on purpose so the timing reflects the
    network, not server work."""
    return {
        "status": "ok",
        "server_time": datetime.now(timezone.utc).isoformat(),
        "boot_id": BOOT_ID,
    }


@app.get("/api/info")
def info():
    """One-shot deployment fingerprint: proves which container/host is
    actually serving traffic, and surfaces the env vars a hosting
    platform typically injects."""
    uptime = time.time() - APP_START_TIME
    return {
        "hostname": socket.gethostname(),
        "boot_id": BOOT_ID,
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "uptime_seconds": round(uptime, 1),
        "started_at": datetime.fromtimestamp(APP_START_TIME, tz=timezone.utc).isoformat(),
        "env": {
            "PORT": os.environ.get("PORT", "not set"),
            "HOST": os.environ.get("HOST", "not set"),
            "APP_ENV": os.environ.get("APP_ENV", "not set"),
        },
    }


@app.get("/api/stats")
def stats():
    """Increments and returns an in-memory request counter, mainly to give
    the dashboard something that visibly changes across page loads/visitors."""
    count = _bump_counter()
    return {"requests_served": count}


@app.get("/api/health")
def health():
    return {"status": "healthy"}


@app.get("/api/speedtest/download")
def speedtest_download(bytes: int = 2_000_000):
    """Returns random, incompressible bytes so the browser can time a real
    download and derive throughput. Capped to keep this cheap on shared hosts."""
    size = max(50_000, min(bytes, 8_000_000))
    payload = os.urandom(size)
    return Response(
        content=payload,
        media_type="application/octet-stream",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/api/speedtest/upload")
async def speedtest_upload(request: Request):
    """Reads whatever the client sends and reports how many bytes arrived,
    so upload throughput can be timed client-side."""
    body = await request.body()
    return {"received_bytes": len(body)}


# The dashboard is a single self-contained HTML file (inline CSS/JS) on
# purpose: hosting platforms that reverse-proxy this app under a subpath
# (e.g. host:8080/go/test) would 404 on absolute asset paths like
# /static/style.css. Zero extra asset requests = nothing to break.
@app.get("/")
def index():
    return FileResponse(str(STATIC_DIR / "index.html"))
