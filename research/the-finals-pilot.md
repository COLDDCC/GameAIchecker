# THE FINALS — evidence-first pilot

This pilot is an implementation specification, not a verified finding. Never label an absence of evidence as evidence of absence.

## Identity
- Steam App ID: 2073850
- Name: THE FINALS
- Developer: Embark Studios
- Store: https://store.steampowered.com/app/2073850/THE_FINALS/

## Review state
- Overall: **Pending source review**
- AI involvement score: **Unrated**
- Source collection date: Not yet recorded
- Reviewer: Unassigned

## Evidence categories
| Category | Status | Required evidence |
| --- | --- | --- |
| Visual art / UI | Unreviewed | Official statement or inspectable attributed asset evidence |
| Character / 3D assets | Unreviewed | Official developer production notes |
| Voice / audio | Unreviewed | Direct developer statement with date and original URL |
| Narrative / text | Unreviewed | Direct developer statement or documented evidence |
| Code / development assistance | Unreviewed | Direct developer statement |
| Runtime generative AI | Unreviewed | Technical documentation or official disclosure |
| Marketing / promotional assets | Unreviewed | Official asset credits or developer disclosure |

## Source object contract
Each evidence item must store:
- `evidence_id`, `steam_app_id`, `category`
- `claim`, `source_type` (official / developer / third-party / community)
- `original_url`, `published_at`, `retrieved_at`
- `quoted_excerpt` (short excerpt only), `archived_url` (optional)
- `review_status` (unreviewed / corroborated / disputed / rejected)
- `reviewer`, `reviewed_at`, `correction_history`

## Proposed UI
1. Steam capsule, title, developer, release metadata.
2. Clear status banner: “Under review — no AI score assigned”.
3. Six-category evidence table with status and source links.
4. Evidence timeline with source dates and corrections.
5. Community signals separate from editorial findings.
6. Report-evidence action, enabled only when moderation/backend exists.

## Acceptance criteria
- Never imply that “not disclosed” means “AI-free”.
- Never use community vote totals as proof.
- Never assign numerical AI percentages without a documented reproducible methodology.
- Every confirmed category links to a source and reviewer decision.
- Mobile users can see status and categories without horizontal scrolling.
- Page can be generated from one structured record and reused for the next five games.

## Next engineering step
Connect this schema to the existing Astro game detail renderer, verify the official Steam disclosure and dated developer statements, then publish the verified sample. Do not publish this unreviewed specification as a final game assessment.
