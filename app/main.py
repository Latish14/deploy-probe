import os
import platform
import socket
import time
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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


# Serve the frontend. /static holds assets, / serves the dashboard itself.
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def index():
    return FileResponse(str(STATIC_DIR / "index.html"))
