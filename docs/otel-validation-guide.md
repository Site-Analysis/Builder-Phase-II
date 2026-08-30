# OpenTelemetry Validation Guide — SAT

Jaeger UI: `http://localhost:16686` (local) · `http://otel.yoursite.com:16686` (AWS)

---

## Architecture

```
FastAPI services ──gRPC 4317──┐
                               ├──► otel/opentelemetry-collector-contrib ──► jaegertracing/all-in-one
Next.js (Vercel) ──HTTP 4318──┘
```

Docker compose runs collector + Jaeger alongside all backend services. All spans flow through the collector before Jaeger stores them.

---

## Services & Ports

| Service | Port | Mode | Key Flag |
|---------|------|------|----------|
| temperature | 8000 | Architect | `feature.temperature.thermal-profile` |
| sunpath | 8001 | Architect | `feature.sunpath.diagram` |
| flood | 8002 | Architect + Builder | `feature.flood.risk-analysis` |
| wind | 8003 | Architect | `feature.wind.analysis` |
| rainfall | 8004 | Architect | `feature.rainfall.summary` |
| geo | 8005 | Both | `feature.zoning.land-use` (+ 9 others) |
| planning | 8006 | Both | `feature.planning.far-assembly` |
| infrastructure | 8007 | Builder | `feature.infrastructure.connectivity` |
| future-infra | 8008 | Both | `feature.context.growth-pipeline` |
| land-records | 8009 | Builder | `feature.land.records` |
| cadastral | 8011 | Builder | `feature.cadastral.land-records` |
| report | 8010 | Builder | `feature.report.go-no-go` |

**GEE required (needs `gee-sa.json`):** sunpath, flood, rainfall (partial)  
**Cadastral submodule required:** cadastral service

---

## Architect Mode — Feature Map

Architect mode (`viewProfile = "architect"`) shows environment analysis panels. Triggered at `/select-profile`.

| Panel | Service | Endpoint | Flag |
|-------|---------|----------|------|
| Sun Path | sunpath:8001 | `GET /sunpath/summer`, `/winter`, `/annual`, `/solar-day`, `/diagram.svg` | `feature.sunpath.diagram` |
| Shadow | sunpath:8001 | `POST /shadow/calculate/bbox`, `/timeseries/*`, `/cumulative/*` | `feature.sunpath.diagram` |
| Buildings | sunpath:8001 | `POST /buildings/bbox`, `/radius`, `/polygon` | `feature.sunpath.diagram` |
| Flood Risk | flood:8002 | `POST /flood/analyze` | `feature.flood.risk-analysis` |
| Temperature | temperature:8000 | `GET /weather/thermal-profile`, `/climate-archive` | `feature.temperature.thermal-profile` |
| Wind | wind:8003 | `POST /wind/analyze` | `feature.wind.analysis` |
| Rainfall | rainfall:8004 | `POST /rainfall/summary`, `GET /rainfall/archive` | `feature.rainfall.summary` |
| Zoning | geo:8005 | `GET /geo/zone`, `/geo/zone-resolve`, `/geo/ring` | `feature.zoning.land-use` |
| Amenities | geo:8005 | `GET /geo/amenities` | `feature.geo.amenities` |
| Overlays | geo:8005 | `GET /geo/overlays` | `feature.geo.overlays` |
| Planning/FAR | planning:8006 | `POST /planning/far`, `/planning/obligations` | `feature.planning.far-assembly` |
| Transport | geo:8005 | `GET /geo/transport-access` | `feature.geo.transport-access` |
| Growth | future-infra:8008 | `GET /future-infra/pipeline`, `/metro-nearest` | `feature.context.growth-pipeline` |
| Infrastructure | infrastructure:8007 | `POST /infrastructure/connectivity` | `feature.infrastructure.connectivity` |

---

## Builder Mode — Feature Map

Builder mode (`viewProfile = "builder"`) adds cadastral explorer, parcel selection, and feasibility verdict.

### Cadastral Overlays (map layers — no flag needed to render, data from cadastral:8011)

| Overlay | Endpoint | Flag |
|---------|----------|------|
| Parcel geometry | `GET /parcels-by-bbox` | `feature.cadastral.land-records` |
| LGD villages | `GET /lgd-villages` | `feature.cadastral.overlays` |
| Road widths | `GET /road-width?bbox=` | `feature.cadastral.overlays` |
| Encroachment | `GET /encroachment?bbox=` | `feature.cadastral.overlays` |
| BWSSB sewerage | `GET /bwssb-sewerage?tier=&bbox=` | `feature.cadastral.overlays` |
| Power lines | `GET /osm-powerlines?bbox=` | `feature.cadastral.overlays` |
| Gas pipelines | `GET /gas-pipelines?bbox=` | `feature.cadastral.overlays` |
| Drainage | `GET /drainage?bbox=` | `feature.cadastral.overlays` |
| Storm drains | `GET /bbmp-swd?bbox=` | `feature.cadastral.overlays` |
| WRIS lakes | `GET /wris-lakes?bbox=` | `feature.cadastral.overlays` |

### Builder Feasibility Signals (triggered on parcel click → Analyze)

| Signal | Service | Endpoint | Flag |
|--------|---------|----------|------|
| Zone resolve | geo:8005 | `GET /geo/zone-resolve` | `feature.geo.zone-resolver` |
| Ring / RMP | geo:8005 | `GET /geo/ring` | `feature.geo.zone-resolver` |
| FAR assembly | planning:8006 | `POST /planning/far` | `feature.planning.far-assembly` |
| Obligations | planning:8006 | `POST /planning/obligations` | `feature.planning.mixed-use` |
| Deal-killer overlays | geo:8005 | `GET /geo/overlays` | `feature.geo.overlays` |
| Terrain / slope | flood:8002 | `POST /flood/terrain` | `feature.flood.terrain` |
| Connectivity | infrastructure:8007 | `POST /infrastructure/connectivity` | `feature.infrastructure.connectivity` |
| Utilities NOC | infrastructure:8007 | `POST /infrastructure/utilities` | `feature.infrastructure.utilities` |
| Land records | land-records:8009 | `POST /land-records/lookup` | `feature.land.records` |
| Price upside | future-infra:8008 | `POST /future-infra/price-upside` | `feature.context.growth-pipeline` |
| GO/NO-GO verdict | report:8010 | `POST /report/go-no-go` | `feature.report.go-no-go` |

---

## Validation Sweep — Quick Commands

Run after any deployment to confirm all services are traced.

### 1. Health check all services

```bash
for port in 8000 8001 8002 8003 8004 8005 8006 8007 8008 8009; do
  status=$(curl -sf http://localhost:$port/health 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null)
  echo "  :$port  ${status:-UNREACHABLE}"
done
```

Expected: all print `ok`. `UNREACHABLE` = service not running.

### 2. Check Jaeger has all services

```bash
curl -s http://localhost:16686/api/services | python3 -c "
import json, sys
svcs = json.load(sys.stdin)['data']
expected = ['temperature','sunpath','flood','wind','rainfall','geo','planning','infrastructure','future-infra','land-records','sat-web']
for s in expected:
    print(('OK ' if s in svcs else 'MISSING ') + s)
"
```

### 3. Check traces flowing (last 10 min)

```bash
# Replace <service> with any service name
curl -s "http://localhost:16686/api/traces?service=<service>&limit=5&lookback=10m" | \
  python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'{len(d[\"data\"])} traces found')
for t in d['data'][:3]:
    s = t['spans'][0]
    tags = {tag['key']: tag['value'] for tag in s.get('tags', [])}
    print(f'  {s[\"operationName\"]} status={tags.get(\"http.status_code\",\"?\")} duration={s[\"duration\"]}us')
"
```

### 4. Validate a flag-gated endpoint (expect 403 if FLAGS not set)

```bash
# Returns 403 → flag disabled (expected in dev without FLAGS set)
# Returns 200 → flag enabled and working
curl -s http://localhost:8000/weather/thermal-profile?lat=12.97&lon=77.59&year=2023 | python3 -c "
import json, sys; d=json.load(sys.stdin)
print('FLAG STATUS:', 'DISABLED' if 'flag' in str(d.get('detail','')).lower() else 'ENABLED')
"
```

### 5. End-to-end Builder verdict trace

```bash
# Sends one request that chains geo → planning → infrastructure → report
# All 4 services should appear in the same trace in Jaeger
curl -s -X POST http://localhost:8010/report/go-no-go \
  -H "Content-Type: application/json" \
  -d '{
    "parcel": {"lat": 12.97, "lon": 77.59, "survey_no": "TEST-123"},
    "signals": {},
    "render_pdf": false,
    "persist": false
  }' | python3 -c "import json,sys; d=json.load(sys.stdin); print('verdict:', d.get('verdict', d.get('detail','?')))"
```

---

## Reading Traces in Jaeger

### Service selector
Open `http://localhost:16686` → select service from dropdown → Find Traces.

### Span anatomy

Each HTTP request generates a parent span + child spans:

```
GET /geo/zone   ← parent span (FastAPI route)
  http send     ← child: response write
```

Key tags on each span:
- `http.method` — GET / POST
- `http.url` — full request URL  
- `http.status_code` — 200 / 403 / 422 / 500
- `http.route` — matched route pattern
- `service.name` — which service handled it
- `error` — true if exception raised

### Status codes to watch

| Code | Meaning | Action |
|------|---------|--------|
| 200 | OK | Normal |
| 403 | Feature flag disabled | Set `FLAGS=` env var |
| 422 | Missing/invalid params | Check frontend request body |
| 500 | Service error | Check span → Logs tab for stack trace |
| No spans | Service not sending traces | Collector not reachable or service not instrumented |

### Finding slow requests

Jaeger `Find Traces` → set `Min Duration` (e.g. `500ms`) → shows all spans over threshold. Good for spotting GEE or OSM calls that block.

---

## Current Status (validated 2026-08-30)

| Service | Health | Traced | Notes |
|---------|--------|--------|-------|
| temperature | OK | YES | |
| sunpath | NOT STARTED | NO | Needs `gee-sa.json` |
| flood | NOT STARTED | NO | Needs `gee-sa.json` |
| wind | OK | YES | |
| rainfall | OK | YES | Returns real data via GEE fallback |
| geo | OK | YES | |
| planning | OK | YES | |
| infrastructure | OK | YES | |
| future-infra | OK | YES | |
| land-records | OK | YES | |
| cadastral | OK | YES | Runs locally via `.venv` + start.ps1; data from `chirag's cadestral` repo |
| report | NOT STARTED | NO | No docker-compose entry yet |
| sat-web (Next.js) | OK | YES | Via `@vercel/otel` |

**10 / 12 services traced.** Remaining 2: sunpath + flood need `gee-sa.json`; report needs docker-compose entry.

### Cadastral startup (local, not Docker)

```powershell
# From services/cadastral/ — run after adding OTEL env vars
$repo = "C:\Users\tanny\chirag's cadestral\prime-karnataka-cadastral-viewer"
$env:CADASTRAL_REPO_ROOT = $repo
$env:CADASTRAL_DATA_DIR  = "$repo\data\cadastral_lake_v2"
$env:CADASTRAL_DB_PATH   = "$repo\db\karnataka_lands_full.db"
$env:FLAGS               = "feature.cadastral.land-records,feature.cadastral.overlays"
$env:OTEL_SERVICE_NAME   = "cadastral"
$env:OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4317"
$env:OTEL_TRACES_EXPORTER = "otlp"
$svcDir = "C:\Users\tanny\OneDrive\Desktop\Site\SAT\services\cadastral"
& "$svcDir\.venv\Scripts\opentelemetry-instrument.exe" "$svcDir\.venv\Scripts\uvicorn.exe" app.main:app --host 0.0.0.0 --port 8011
```

---

## Enabling Features (FLAGS)

All data endpoints are disabled by default. Set `FLAGS` env var to enable:

```bash
# Enable everything
export FLAGS="feature.temperature.thermal-profile,feature.sunpath.diagram,feature.flood.risk-analysis,feature.wind.analysis,feature.rainfall.summary,feature.rainfall.archive,feature.zoning.land-use,feature.planning.far-assembly,feature.planning.mixed-use,feature.planning.road-width-resolver,feature.infrastructure.connectivity,feature.infrastructure.utilities,feature.context.growth-pipeline,feature.land.records,feature.land.ownership,feature.geo.amenities,feature.geo.overlays,feature.geo.transport-access,feature.geo.zone-resolver,feature.cadastral.land-records,feature.cadastral.overlays,feature.report.go-no-go,feature.flood.terrain"
```

In `docker-compose.yml` each service already has `FLAGS=${FLAGS:-}` — export the var before `docker-compose up`.

---

## Fix .env + Start Full Stack

Current `.env` contains AWS instance metadata (not env vars). Fix:

```bash
cp .env .env.aws-backup       # preserve AWS notes
cp .env.example .env          # valid template
# Fill in: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# GEE: copy gee-sa.json from /Volumes/LocalDrive/Site Analysis/
```

Then start full stack:

```bash
export FLAGS="feature.temperature.thermal-profile,feature.sunpath.diagram,feature.flood.risk-analysis,feature.wind.analysis,feature.rainfall.summary"
docker-compose up --build -d
```

Jaeger UI shows all 10 backend services + sat-web within 30 seconds of first requests.

---

## Logs Pipeline (minor — non-blocking)

Services attempt to export logs via OTLP. Collector has no `logs` pipeline → `UNIMPLEMENTED` error in service logs. Fix: add to `infra/otel/collector-config.yaml`:

```yaml
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/jaeger]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]   # or a real logs backend
```

Or suppress log export on each service:

```yaml
OTEL_LOGS_EXPORTER: none
```

---

## Adding a New Service

1. Add to `requirements.txt`:
   ```
   opentelemetry-distro>=0.50b0
   opentelemetry-exporter-otlp-proto-grpc>=1.29.0
   ```
2. In `Dockerfile` after pip install:
   ```dockerfile
   RUN opentelemetry-bootstrap -a install
   CMD ["opentelemetry-instrument", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "XXXX"]
   ```
3. In `docker-compose.yml` add:
   ```yaml
   environment:
     - OTEL_SERVICE_NAME=<service-name>
     - OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
     - OTEL_TRACES_EXPORTER=otlp
     - OTEL_PYTHON_LOG_CORRELATION=true
   ```
4. Rebuild → service appears in Jaeger automatically.
