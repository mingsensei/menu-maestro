#!/usr/bin/env bash
set -Eeuo pipefail

revision=${1:?Commit SHA required}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || exit 1
exec 9>"$HOME/.cache/rtr-backend-deploy.lock"
flock -w 300 9
export NVM_DIR="$HOME/.nvm"
# nvm supports its own unset variables during initialization.
set +u
source "$NVM_DIR/nvm.sh"
nvm use --silent 24
set -u
cd /home/ubuntu/apps/backend
git diff --quiet && git diff --cached --quiet || {
  echo 'Tracked server files have local changes; deployment stopped.' >&2
  exit 1
}
previous=$(git rev-parse HEAD)
git fetch --no-tags origin "$revision"
git cat-file -e "$revision^{commit}"
health() {
  for attempt in {1..15}; do
    if curl --fail --silent --show-error --max-time 3 http://127.0.0.1:3001/api/health; then
      return 0
    fi
    sleep 2
  done
  return 1
}
rollback() {
  status=$?
  trap - ERR
  echo "Deployment failed; restoring $previous" >&2
  set +e
  git switch --detach "$previous"
  npm ci --omit=dev
  pm2 restart rtr-backend
  health
  pm2 save
  exit "$status"
}
trap rollback ERR
# .env and the persistent knowledge file remain on the server.
git switch --detach "$revision"
npm ci --omit=dev
node --env-file-if-exists=.env deployment/update-restaurant-contact.mjs
pm2 restart rtr-backend
health
pm2 save
trap - ERR
echo "Backend deployed: $revision"
