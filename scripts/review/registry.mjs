// The legacy sets retain their distinct behavior; only intake games use this entry point.
import { readFileSync } from 'node:fs';
const registry = JSON.parse(readFileSync('scripts/review/state/registered-games.json', 'utf8'));
export const activeIntakeIds = registry.active;
export const pendingIntakeIds = registry.pendingMedia;
