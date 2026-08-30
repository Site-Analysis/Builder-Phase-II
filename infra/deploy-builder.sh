#!/usr/bin/env bash
# Idempotent setup script for the qnit-builder EC2 (Ubuntu 22.04, ap-south-1).
# Run once as root after the instance is launched:
#   ssh -i qnit-ec2.pem ubuntu@<ELASTIC-IP> 'sudo bash -s' < infra/deploy-builder.sh
#
# Prerequisites:
#   - EC2 has IAM instance profile with s3:GetObject + s3:ListBucket on qnit-builder-data
#   - Data uploaded to s3://qnit-builder-data/ from local (see DEPLOY.md Step 0)
#   - qnit-builder-sg allows 22/80/443 inbound

set -euo pipefail

REPO_URL="https://github.com/Site-Analysis/SAT.git"
REPO_BRANCH="main"
DEPLOY_DIR="/opt/qnit/builder"
S3_BUCKET="qnit-builder-data"
REGION="ap-south-1"

echo "=== [1/7] System packages ==="
apt-get update -qq
apt-get install -y curl gnupg git awscli nodejs npm rsync

# Docker official repo (docker-compose-plugin not in Ubuntu default apt)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

# Caddy official repo
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy.gpg
echo "deb [signed-by=/usr/share/keyrings/caddy.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" \
  > /etc/apt/sources.list.d/caddy.list

apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin caddy

systemctl enable docker caddy
systemctl start docker

echo "=== [2/7] Clone repository ==="
mkdir -p "$(dirname "$DEPLOY_DIR")"
if [ -d "$DEPLOY_DIR/.git" ]; then
  git -C "$DEPLOY_DIR" pull origin "$REPO_BRANCH"
else
  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$DEPLOY_DIR"
fi
cd "$DEPLOY_DIR"

echo "=== [3/7] Pull data from S3 ==="
mkdir -p /data/cadastral
aws s3 sync "s3://${S3_BUCKET}/cadastral/" /data/cadastral/ --region "$REGION"

echo "=== [4/7] Symlink data paths for Docker Compose volumes ==="
# Base docker-compose.yml mounts ./services/cadastral-data — redirect to S3-pulled path.
ln -sfn /data/cadastral "$DEPLOY_DIR/services/cadastral-data"
# Stub gee-sa.json so compose volume mount doesn't fail (GEE not used in this deploy)
touch "$DEPLOY_DIR/gee-sa.json"

echo "=== [5/7] Configure .env ==="
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
  echo ""
  echo ">>> ACTION REQUIRED: edit $DEPLOY_DIR/.env"
  echo "    Set: KC_ADMIN_PASSWORD, NEXTAUTH_SECRET, NEXT_PUBLIC_SUPABASE_URL,"
  echo "         NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and FLAGS (all 20 flags)."
  echo "    Example FLAGS value is in infra/DEPLOY.md."
  echo "    Run: nano $DEPLOY_DIR/.env"
  echo ""
  echo "    Press ENTER after editing .env to continue, or Ctrl-C to abort."
  read -r
fi

echo "=== [6/7] Build and start backend services ==="
cd "$DEPLOY_DIR"
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.builder.yml \
  up -d --build

echo "=== [7/7] Health check ==="
sleep 15
FAILED=0
for svc_port in "temperature:8000" "sunpath:8001" "flood:8002" "wind:8003" \
                "rainfall:8004" "geo:8005" "planning:8006" "infrastructure:8007" \
                "future-infra:8008" "land-records:8009" "report:8010" "cadastral:8011"; do
  SVC="${svc_port%%:*}"
  PORT="${svc_port##*:}"
  if curl -sf "http://localhost:${PORT}/health" > /dev/null 2>&1; then
    echo "  ✓ ${SVC}"
  else
    echo "  ✗ ${SVC} — check: docker compose logs ${SVC}"
    FAILED=$((FAILED + 1))
  fi
done

if [ $FAILED -eq 0 ]; then
  echo ""
  echo "=== Deploy complete ==="
  echo "  API:  https://api.builder.qnit.site  (after DNS A record)"
  echo "  Auth: https://auth.builder.qnit.site (after DNS A record)"
  echo ""
  echo "Next steps:"
  echo "  1. Add DNS A records pointing api.builder.qnit.site and auth.builder.qnit.site to this IP"
  echo "  2. Caddy auto-provisions TLS once DNS resolves"
  echo "  3. Create Keycloak test user at https://auth.builder.qnit.site/admin"
  echo "  4. Connect Vercel frontend to https://builder.qnit.site"
else
  echo ""
  echo "=== $FAILED service(s) failed health check. Inspect logs before proceeding. ==="
  exit 1
fi
