#!/usr/bin/env bash
# Met a jour ServiceNow360 sur le VPS a partir de la branche main.
# A lancer sur le serveur : sudo bash /srv/servicenow360/app/deploy/redeploy.sh
set -euo pipefail

APP_DIR=/srv/servicenow360/app
APP_USER=sn360
SERVICE=servicenow360

echo "==> Recuperation de la derniere version"
sudo -u "$APP_USER" git -C "$APP_DIR" fetch --quiet origin main
sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard --quiet origin/main
echo "    commit : $(sudo -u "$APP_USER" git -C "$APP_DIR" rev-parse --short HEAD)"

echo "==> Dependances"
sudo -u "$APP_USER" -H bash -c "cd $APP_DIR && npm install --no-audit --no-fund" >/dev/null

echo "==> Schema de base"
sudo -u "$APP_USER" -H bash -c "cd $APP_DIR && npx prisma db push --skip-generate"

echo "==> Build"
sudo -u "$APP_USER" -H bash -c "cd $APP_DIR && npm run build" | tail -3

echo "==> Redemarrage du service"
systemctl restart "$SERVICE"
sleep 5
systemctl is-active "$SERVICE"

echo "==> Verification"
curl -s -o /dev/null -w "    HTTP %{http_code} en %{time_total}s\n" http://127.0.0.1:3001/
echo "Termine."
