# GameAIchecker

When the owner asks to add or continue adding games (e.g. "继续增加10个新游戏", "继续收录 N 个游戏", "继续上次批次"),
read and follow `.agents/skills/gameaichecker-intake/SKILL.md`. In a cloud sandbox that cannot reach Steam or
gameaichecker.com, use its "云端沙箱路线" section (`INTAKE_FETCH=actions`, `remote_fetch.py cache-pull` first).

Background: `docs/AGENT_HANDOFF.md`, `docs/SEARCH_DEMAND_POLICY.md`. Existing game records and owner-reviewed
results are read-only. Never merge the `intake-cache` branch into `main`.
