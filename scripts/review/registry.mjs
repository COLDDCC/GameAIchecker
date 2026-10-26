// The legacy sets retain their distinct behavior; only intake games use this entry point.
import { readFileSync } from 'node:fs';
const registry = JSON.parse(readFileSync(new URL('./state/registered-games.json', import.meta.url), 'utf8'));
export const activeIntakeIds = registry.active;
export const pendingIntakeIds = registry.pendingMedia;
