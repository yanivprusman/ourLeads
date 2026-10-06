#!/usr/bin/env bash
#
# Deploy the latest dev commit to prod — run after every commit by
# .githooks/post-commit (Yaniv, 2026-10-06: "both versions need to be up to date",
# he on dev and Dudu on prod work the same board at the same time).
#
# Runs as its own transient systemd unit (see the hook), not as a child of
# whatever made the commit: a commit made inside a Claude session or a dashboard
# service would otherwise own the deploy, and ending that session would kill it
# halfway through a build.
#
# Serialized with flock; several commits in a row queue up, and each run
# deploys whatever dev's HEAD is THEN, so a queue of runs ends in one deploy of
# the newest commit and no-ops for the rest.
set -uo pipefail

exec 9>/run/lock/ourleads-autodeploy.lock
flock 9

dev=/opt/dev/ourLeads
prod="$(/usr/local/bin/daemon send getAppRoots | jq -er .prodRoot)" || { echo "auto-deploy: no prod root from the daemon" >&2; exit 1; }
prod="${prod%/}/ourLeads"
want="$(git -C "$dev" rev-parse HEAD)" || { echo "auto-deploy: cannot read dev HEAD" >&2; exit 1; }
have="$(git -C "$prod" rev-parse HEAD 2>/dev/null)"
if [[ "$want" == "$have" ]]; then
    echo "auto-deploy: prod already at ${want:0:7}"
    exit 0
fi
echo "auto-deploy: prod ${have:0:7} -> ${want:0:7}"
/usr/local/bin/daemon send deployToProd --app ourLeads --commit "$want"
