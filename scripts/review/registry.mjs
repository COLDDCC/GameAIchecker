// The legacy sets retain their distinct behavior; only intake games use this entry point.
import { readFileSync } from 'node:fs';
const registry = JSON.parse(readFileSync('scripts/review/state/registered-games.json', 'utf8'));
export const activeIntakeIds = registry.active;
export const pendingIntakeIds = registry.pendingMedia;

// Steam removed these reviewed apps (checked 2026-10-29: appdetails returns no data and header.jpg is 404), so no
// build can ever obtain their artwork. Without this exemption one delisting fails every deploy on every branch.
export const delistedIds = new Set(['5004560', '5315310']);
