# Search demand before a new review

Effective 2026-10-27. This policy changes candidate selection, not the evidence standard or old findings. The current in-progress batches retain their recorded policy and resume before new reservations.

1. Measure a game-specific query in GSC (positive impressions) or a keyword tool (positive monthly searches). Associate it manually with the exact Steam App ID; resolve namesakes and demo/full-game differences first.
2. Save the source URL, observation date, query, metric and value. Values must be positive and no older than 90 days. A news article, a search result or a controversy is a discovery lead, not a search-volume measurement.
3. Run `python3 scripts/review/import-demand.py --input /path/to/reviewed-metrics.json`. It saves a private hashed snapshot, imports a new candidate or attaches demand to an unreserved queued candidate. `--dry-run` previews queue changes; evidence snapshots are still saved locally.
4. `start` and replacement selection only choose candidates with valid measured demand. Missing, changed, zero or stale snapshots are rejected. Candidates stay in the queue so leads are not lost. Original snapshots must remain available when resuming selection in another workspace.
5. Among demand-qualified candidates, prioritize official AI disclosures, relevant English queries and unresolved evidence questions. GSC impressions already establish some demand; do not discard a useful query merely for low volume.
6. Perform the full existing source review. New-policy decisions additionally require `english: {summary, reviewNote, aiAreaNotes: {ingame, code, art, music, voice, writing, translation, marketing}}`. All fields must be English and preserve scope/caveats. The publisher embeds these in the new canonical with a source hash; `npm run check:english` consumes them without manually editing the old sidecar.

Input example (illustrative values only; do not import as measured production data):

```json
[{"appId":"STEAM_APP_ID","name":"Exact game name","query":"does exact game name use ai","kind":"gsc","metric":"impressions","value":1,"observedAt":"RECENT_ISO_TIMESTAMP","sourceUrl":"https://search.google.com/search-console/"}]
```

For keyword-tool exports use `kind: keyword_tool`, `metric: monthly_searches`, and the tool report URL. Do not manufacture volume or treat an AI allegation as a finding.

Crimson Desert and Vapor World are retained in `scripts/review/state/search-demand-seeds.json`. Original Steam sources were inspected; measured demand is still unknown. Crimson Desert already has a canonical record and must not be counted as a new game. Do not automatically start a new review of either seed until demand is established.

Weekly editorial review: use the last 28 days of GSC queries to choose candidates; after publishing, inspect index status and query impressions before expanding similar pages. Optional linkable lists should offer dated, explicit selection criteria and source links rather than repeat existing category pages.
