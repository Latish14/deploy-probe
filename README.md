# Deploy Probe

A tiny, single-container app built for one job: sanity-checking a self-hosting
pipeline. Point your hosting tool at this repo, let it pick up the
`Dockerfile` / `docker-compose.yml`, and open the link it gives you back. If
the dashboard loads and the signal meter starts ticking, your pipeline works.

## What's in the box

```
deploy-probe/
├── app/
│   └── main.py        FastAPI app: serves the dashboard + a few JSON endpoints
├── static/
│   ├── index.html      dashboard markup
│   ├── style.css        telemetry-console styling
│   └── script.js       ping loop, oscilloscope trace, timing readouts
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── .dockerignore
```

## Run it locally

```bash
docker compose up --build
```

Then open http://localhost:8000

## What the dashboard shows

- **Connection signal** — a phone-style signal meter and an oscilloscope-style
  trace, both driven by real round-trip pings from your browser to `/api/ping`
  every 2 seconds. Bars turn amber/red and the trace jumps if latency rises or
  a ping drops, so you can see connection quality on the deployed link in real
  time.
- **This page's load** — a breakdown of DNS, TCP, TTFB, download, and DOM
  processing time for the page itself, taken straight from the browser's
  Navigation Timing API.
- **Deployment fingerprint** — hostname, boot id, uptime, Python version, and
  the `PORT` env var the container is actually running on. Useful for
  confirming you're hitting the container you think you are, especially after
  a redeploy.
- **Requests served** — an in-memory counter that climbs every time
  `/api/stats` is called, so you can visibly confirm traffic is reaching the
  container.

## API endpoints

| Route         | Purpose                                       |
|---------------|------------------------------------------------|
| `GET /`       | dashboard HTML                                 |
| `GET /api/ping`   | cheap round-trip check, used for the signal meter |
| `GET /api/info`   | host/runtime/env fingerprint                    |
| `GET /api/stats`  | bumps and returns the request counter           |
| `GET /api/health` | used by the Docker healthcheck                  |

## Notes for the hosting platform

- The container reads `PORT` from the environment and binds to it
  (`uvicorn --host 0.0.0.0 --port ${PORT}`), defaulting to `8000` if unset —
  this matches how most PaaS-style hosts inject their own port.
- A `HEALTHCHECK` is defined in the `Dockerfile` hitting `/api/health`.
- No database or external service required — everything is in-memory, so it's
  safe to spin up, tear down, and redeploy repeatedly while testing.
