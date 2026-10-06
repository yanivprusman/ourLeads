#!/bin/bash
# What the daemon's own hooks do (AppManager::installHooksForApp): this repo sets
# core.hooksPath=.githooks, so .git/hooks no longer runs and this must.
WORK_TREE="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$WORK_TREE" ] && exit 0
DAEMON="/opt/automateLinux/daemon/daemon"
[ -x "$DAEMON" ] && "$DAEMON" send refreshAppVersion --path "$WORK_TREE" >/dev/null 2>&1 &
exit 0
