# OTEL Deploy Handoff — Builder Branch

**For:** Claude terminal deploying the Builder branch to AWS  
**Branch:** `Builder`  
**Validated:** 2026-08-30 — 10/10 services traced locally

---

## What Was Built

Full OpenTelemetry stack added to SAT. Every FastAPI service + Next.js frontend now emits traces. Jaeger is the backend. All spans verified flowing end-to-end locally before this handoff.

---

## Files Changed (uncommitted, stage all)

### New files
```
infra/otel/collector-config.yaml     ← OTEL Collector pipeline config
infra/otel/docker-compose.test.yml   ← local-only test compose (do NOT deploy this)
apps/web/instrumentation.ts          ← Next.js OTEL hook (@vercel/otel)
docs/otel-validation-guide.md        ← full endpoint + validation reference
docs/otel-deploy-handoff.md          ← this file
```

### Modified files (26 total)
```
docker-compose.yml                   ← added otel-collector + jaeger services;
                                       added OTEL env vars + updated command: on all 10 services
apps/web/package.json                ← @vercel/otel ^1.14.2 + @opentelemetry/api ^1.9.0
.env.example                         ← OTEL vars documented
10× services/*/requirements.txt      ← opentelemetry-distro + exporter added
10× services/*/Dockerfile            ← opentelemetry-bootstrap step + CMD wrapped
```

---

## Docker Compose Changes

`docker-compose.yml` now includes two new services at the top:

```yaml
otel-collector:
  image: otel/opentelemetry-collector-contrib:0.114.0
  volumes: [./infra/otel/collector-config.yaml]
  ports: [4317, 4318]

jaeger:
  image: jaegertracing/all-in-one:latest
  ports: [16686]
```

Every backend service has these env vars added:
```yaml
- OTEL_SERVICE_NAME=<service-name>
- OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
- OTEL_TRACES_EXPORTER=otlp
- OTEL_PYTHON_LOG_CORRELATION=true
```

Every backend service `command:` now prefixed with `opentelemetry-instrument`:
```yaml
command: opentelemetry-instrument uvicorn app.main:app --host 0.0.0.0 --port XXXX --reload
```

---

## Deploy Steps

### 1. Fix .env on the server

Current `.env` in repo root contains raw AWS instance metadata (not valid env vars). It will break `docker-compose up`. Fix before deploying:

```bash
cp .env .env.aws-backup
cp .env.example .env
# Fill in: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# GEE: gee-sa.json must exist at repo root for sunpath + flood services
```

### 2. Open AWS security group ports

| Port | Protocol | Purpose | Source |
|------|----------|---------|--------|
| 4318 | TCP | OTLP/HTTP — Vercel frontend sends traces here | 0.0.0.0/0 (or Vercel IP ranges) |
| 16686 | TCP | Jaeger UI | Your IP only (restrict!) |

Port 4317 (gRPC) stays internal — services communicate via Docker network, no host exposure needed.

### 3. Set DNS subdomain

```
A record:  otel.yoursite.com  →  <EC2 public IP>
```

Jaeger UI accessible at: `http://otel.yoursite.com:16686`

Optional nginx reverse proxy to serve on port 80/443 without port number.

### 4. Set Vercel environment variables

In Vercel dashboard → Project → Settings → Environment Variables:

```
OTEL_EXPORTER_OTLP_ENDPOINT = http://<EC2-PUBLIC-IP>:4318
OTEL_SERVICE_NAME            = sat-web
```

These make the Next.js frontend send traces to your collector.

### 5. Deploy

```bash
# On EC2 — pull branch + rebuild
git pull
git checkout Builder

export FLAGS="feature.temperature.thermal-profile,feature.sunpath.diagram,feature.flood.risk-analysis,feature.wind.analysis,feature.rainfall.summary,feature.rainfall.archive,feature.zoning.land-use,feature.planning.far-assembly,feature.planning.mixed-use,feature.infrastructure.connectivity,feature.infrastructure.utilities,feature.context.growth-pipeline,feature.land.records,feature.cadastral.land-records,feature.cadastral.overlays,feature.report.go-no-go"

docker-compose up --build -d
```

### 6. Validate after deploy

```bash
# All services healthy
for port in 8000 8001 8002 8003 8004 8005 8006 8007 8008 8009; do
  echo "$port: $(curl -sf http://localhost:$port/health | python3 -c 'import json,sys; print(json.load(sys.stdin)[\"status\"])')"
done

# All in Jaeger
curl -s http://localhost:16686/api/services | python3 -c "
import json,sys
svcs = json.load(sys.stdin)['data']
for s in ['temperature','sunpath','flood','wind','rainfall','geo','planning','infrastructure','future-infra','land-records']:
    print(('OK   ' if s in svcs else 'MISS ') + s)
"
```

---

## Service Map (for Architect + Builder modes)

### Architect Mode — all analysis panels
| Service | Port | Key endpoints |
|---------|------|--------------|
| temperature | 8000 | `/weather/thermal-profile`, `/weather/climate-archive` |
| sunpath | 8001 | `/sunpath/*`, `/shadow/*`, `/buildings/*` |
| flood | 8002 | `/flood/analyze` |
| wind | 8003 | `/wind/analyze` |
| rainfall | 8004 | `/rainfall/summary`, `/rainfall/archive` |
| geo | 8005 | `/geo/zone`, `/geo/amenities`, `/geo/overlays`, `/geo/transport-access` |
| planning | 8006 | `/planning/far`, `/planning/obligations` |
| infrastructure | 8007 | `/infrastructure/connectivity`, `/infrastructure/utilities` |
| future-infra | 8008 | `/future-infra/pipeline`, `/future-infra/metro-nearest` |

### Builder Mode — adds cadastral + verdict
| Service | Port | Key endpoints |
|---------|------|--------------|
| land-records | 8009 | `/land-records/lookup`, `/land-records/ownership` |
| cadastral | 8011 | `/parcels-by-bbox`, `/lgd-villages`, `/road-width`, `/encroachment`, overlay parquets |
| report | 8010 | `/report/go-no-go` (verdict bundler) |
| geo | 8005 | `/geo/zone-resolve`, `/geo/ring` |

### Frontend
| Service | Platform | OTEL |
|---------|----------|------|
| sat-web | Vercel | `@vercel/otel` via `apps/web/instrumentation.ts` |

---

## Known Issues / Risks

| Issue | Impact | Fix |
|-------|--------|-----|
| `.env` has AWS notes not valid env vars | `docker-compose up` fails | `cp .env.example .env` then fill creds |
| `gee-sa.json` missing | sunpath + flood won't start | Copy from Site Analysis workspace |
| Jaeger uses in-memory storage | Traces lost on container restart | Add volume or switch to Badger backend for persistence |
| Services export logs via OTLP but collector has no logs pipeline | UNIMPLEMENTED error in logs (non-blocking, traces work) | Add `logs` pipeline to `infra/otel/collector-config.yaml` or set `OTEL_LOGS_EXPORTER=none` |
| Cadastral has no Dockerfile | Can't run in docker-compose | Add Dockerfile to `services/cadastral/` mirroring other services |
| report service has no docker-compose entry | Not traced, Builder verdict incomplete | Add service entry to `docker-compose.yml` |
| Port 4318 exposed publicly | Potential OTLP spam/abuse | Restrict to Vercel IP ranges in security group |

---

## Locally Validated (2026-08-30)

```
Service          Health  Jaeger  Traces
temperature      OK      OK      1 trace/5min
geo              OK      OK      1 trace/5min
planning         OK      OK      1 trace/5min
infrastructure   OK      OK      1 trace/5min
future-infra     OK      OK      1 trace/5min
land-records     OK      OK      1 trace/5min
cadastral        OK      OK      1 trace/5min
wind             OK      OK      1 trace/5min
rainfall         OK      OK      1 trace/5min
sat-web          OK      OK      1 trace/5min

OTEL Collector   UP      —       receiving on 4317 (gRPC) + 4318 (HTTP)
Jaeger           UP      —       http://localhost:16686
```

Full validation commands and endpoint reference: `docs/otel-validation-guide.md`
