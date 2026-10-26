#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' 'Legacy ship disabled. Use publish-batch.sh --batch ID --dry-run, then --execute.' >&2
exit 1
