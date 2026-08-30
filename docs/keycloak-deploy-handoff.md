# Keycloak Auth Deploy Handoff — Builder Branch

**For:** Claude terminal deploying the Builder branch to AWS  
**Branch:** `Builder`  
**Implemented:** 2026-08-30

---

## What Was Built

Keycloak replaces Supabase for user authentication. All 11 FastAPI services now validate Keycloak Bearer tokens. Next.js frontend uses `next-auth@5` with the Keycloak OIDC provider.

Supabase stays for project DB persistence only — accessed via service role key from Next.js API routes.

---

## Architecture

```
User → Keycloak login (EC2 :8080 or auth.yoursite.com)
     → next-auth session (access_token = Keycloak RS256 JWT)
     → frontend attaches Authorization: Bearer <token> to every service call
     → FastAPI validates RS256 JWT against Keycloak JWKS endpoint

Projects DB: Next.js API routes (/api/projects) → Supabase service-role key
             (bypasses RLS; server-side session check enforces user isolation)
```

---

## New Files (commit all)

```
infra/keycloak/realm-export.json          ← Keycloak realm auto-imported on start
apps/web/auth.ts                          ← next-auth v5 Keycloak config
apps/web/app/api/auth/[...nextauth]/route.ts  ← next-auth handler
apps/web/app/api/projects/route.ts        ← project list + create (server-side auth)
apps/web/app/api/projects/[id]/route.ts   ← single project fetch
apps/web/lib/supabase/server.ts           ← Supabase admin client (service role key)
services/*/app/auth.py (×11)              ← FastAPI JWKS JWT validator (identical)
docs/keycloak-deploy-handoff.md           ← this file
```

## Modified Files

```
docker-compose.yml                        ← added keycloak service + KEYCLOAK_URL/REALM to all services
apps/web/package.json                     ← added next-auth@5
apps/web/app/layout.tsx                   ← wrapped with <SessionProvider>
apps/web/components/AuthHydrator.tsx      ← replaced supabase.auth with useSession()
apps/web/lib/stores/auth.ts               ← generic AuthUser type (no Supabase types)
apps/web/app/(auth)/login/page.tsx        ← replaced form with signIn("keycloak") redirect
apps/web/lib/api/analysis.ts              ← svcFetch injects Authorization: Bearer
apps/web/lib/api/projects.ts              ← calls /api/projects instead of Supabase direct
.env.example                              ← documented KEYCLOAK_*, NEXTAUTH_*, SUPABASE_SERVICE_ROLE_KEY
services/*/requirements.txt (×11)        ← python-jose[cryptography]>=3.3.0 added
services/*/app/main.py (×11)             ← include_router(..., dependencies=[Depends(verify_token)])
```

---

## Deploy Steps

### 1. Set .env on server

```bash
# Add these to .env (alongside existing Supabase + FLAGS vars):
KEYCLOAK_URL=http://keycloak:8080          # internal Docker DNS — leave as is
KEYCLOAK_REALM=sat
KEYCLOAK_CLIENT_ID=sat-web
KC_ADMIN_PASSWORD=<strong-password>        # change from default "admin"
```

For Next.js on Vercel (set in Vercel dashboard → Environment Variables):
```
KEYCLOAK_URL          = http://<EC2-PUBLIC-IP>:8080    # or https://auth.yoursite.com
KEYCLOAK_REALM        = sat
KEYCLOAK_CLIENT_ID    = sat-web
NEXTAUTH_URL          = https://your-vercel-deployment.vercel.app
NEXTAUTH_SECRET       = <openssl rand -base64 32>
SUPABASE_SERVICE_ROLE_KEY = <from Supabase dashboard → Settings → API>
```

### 2. Open AWS security group port

| Port | Protocol | Purpose | Source |
|------|----------|---------|--------|
| 8080 | TCP | Keycloak UI + OIDC (Vercel frontend needs this) | 0.0.0.0/0 |

Restrict to HTTPS (443) behind nginx in production.

### 3. DNS subdomain (optional but recommended)

```
A record: auth.yoursite.com → <EC2 public IP>
```

Update Vercel `KEYCLOAK_URL` to `http://auth.yoursite.com:8080`.

### 4. Deploy

```bash
git pull && git checkout Builder

# .env must have KEYCLOAK_URL, KC_ADMIN_PASSWORD, NEXTAUTH_SECRET, SUPABASE_SERVICE_ROLE_KEY
docker-compose up --build -d

# Wait ~60s for Keycloak to initialize + import realm
docker-compose logs keycloak | tail -20
# Look for: "Keycloak X.X.X on JVM … started in X.XXXs"
```

### 5. Create a test user in Keycloak

```
Admin console: http://<EC2-IP>:8080/admin
Login: admin / <KC_ADMIN_PASSWORD>

Navigate: sat realm → Users → Add user
  - Username: testuser
  - Email: testuser@example.com
  - Save → Credentials tab → Set password → disable "Temporary"
```

### 6. Verify Keycloak

```bash
# Discovery endpoint
curl http://localhost:8180/realms/sat/.well-known/openid-configuration \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['issuer'])"
# → http://localhost:8180/realms/sat

# Get token (direct grant — requires directAccessGrantsEnabled in realm)
TOKEN=$(curl -s -X POST \
  http://localhost:8180/realms/sat/protocol/openid-connect/token \
  -d "client_id=sat-web&grant_type=password&username=testuser&password=test&scope=openid" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
echo "Token obtained: ${TOKEN:0:40}..."
```

### 7. Verify FastAPI auth

```bash
# Should 401 without token
curl -s http://localhost:8000/weather/thermal-profile?lat=12.97&lon=77.59&year=2023
# → {"detail":"Missing Bearer token"}

# Should 200/403 (200 if flag enabled, 403 if flag disabled) WITH token
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/weather/thermal-profile?lat=12.97&lon=77.59&year=2023"
# → {"status":"ok",...} or {"detail":"feature disabled"}

# /health always public
curl -s http://localhost:8000/health
# → {"status":"ok","service":"temperature"}
```

### 8. Update Keycloak redirect URIs for production domain

After deploy, update the `sat-web` client in Keycloak admin console:
```
Clients → sat-web → Settings
  Valid redirect URIs: add https://your-vercel-deployment.vercel.app/*
  Web origins: add https://your-vercel-deployment.vercel.app
```

---

## Keycloak Container Notes

- Image: `quay.io/keycloak/keycloak:26.7.2`
- Mode: `start-dev` — uses in-memory H2 DB. Realm config **does NOT persist across container restarts** unless volume-backed.
- Realm auto-imported from `infra/keycloak/realm-export.json` on first start (`--import-realm` flag).
- For production: switch to `start` mode + Postgres volume. See Keycloak docs.

### Persistence (recommended for prod)

```yaml
# Add to keycloak service in docker-compose.yml:
volumes:
  - keycloak-data:/opt/keycloak/data
  - ./infra/keycloak/realm-export.json:/opt/keycloak/data/import/realm-export.json:ro
environment:
  KC_DB: postgres
  KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
  KC_DB_USERNAME: keycloak
  KC_DB_PASSWORD: ${KC_DB_PASSWORD}

# Add postgres service + keycloak-data volume entry
```

---

## Risks

| Risk | Mitigation |
|------|-----------|
| `start-dev` loses realm on container restart | Volume-back `/opt/keycloak/data` or switch to `start` + Postgres |
| JWKS cache in FastAPI doesn't refresh on key rotation | Restart services or add TTL to `_get_jwks()` |
| `SUPABASE_SERVICE_ROLE_KEY` grants full DB access | Server-side only; not in `NEXT_PUBLIC_*`; never logged |
| Keycloak port 8080 exposed | Nginx proxy + HTTPS for prod; restrict security group once domain set up |
| Existing Supabase users can't log in | New user base — create accounts in Keycloak admin console |
| Google OAuth broken (was via Supabase) | Configure Keycloak social IDP: realm → Identity providers → Google |

---

## Full Flags Reference

```bash
export FLAGS="feature.temperature.thermal-profile,feature.sunpath.diagram,feature.flood.risk-analysis,feature.wind.analysis,feature.rainfall.summary,feature.rainfall.archive,feature.zoning.land-use,feature.planning.far-assembly,feature.planning.mixed-use,feature.planning.road-width-resolver,feature.infrastructure.connectivity,feature.infrastructure.utilities,feature.context.growth-pipeline,feature.land.records,feature.land.ownership,feature.geo.amenities,feature.geo.overlays,feature.geo.transport-access,feature.geo.zone-resolver,feature.cadastral.land-records,feature.cadastral.overlays,feature.report.go-no-go,feature.flood.terrain"
```
