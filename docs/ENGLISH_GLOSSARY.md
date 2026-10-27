# English editorial contract

English fields live in `data/i18n/games.en.json`, keyed by Steam App ID. Every published game requires `summary`, `reviewNote`, all eight `aiAreaNotes`, and a `sourceDigest`. These are English editorial summaries, not verbatim translations of original quotations. Original source URLs, quotations, review dates, classifications and owner-review markers stay unchanged. Titles and quotations may retain their original language.

| Term | Meaning |
|---|---|
| Official AI disclosure | A developer discloses use; not an independent audit |
| Human-made claim | A developer claim limited to its stated scope |
| No verified AI evidence found | Review did not substantiate use; does not mean AI-free |
| Not stated | Source does not settle this specific area |
| Not reviewed | No completed area-specific conclusion |
| Explicitly stated no use | A source explicitly rules it out; identify who says so |
| In-game generation | Content generated while playing, distinct from traditional NPC logic |
| Code | Coding assistance, completion or refactoring |
| Art | Visual assets and concept art; specify which |
| Music & sound | Includes sound effects; do not imply composition when only audio is named |
| Voice | Generated voices or text-to-speech |
| Writing | Identify game text, narrative or store copy explicitly |
| Translation | Localization, with planned versus implemented use distinguished |
| Marketing | Store imagery, capsule art and promotional copy |

`npm run check:english` runs before any build work. Missing English or a changed source record fails the build. After reviewing an update, compute `editorialDigest(game)` from `src/lib/english.js` for that record and save it as `sourceDigest`; never bulk-refresh hashes without editorial review. Do not infer new findings from an English summary. Intake must prepare English fields before activating a game. Pending-media records stay outside the active index until complete.
