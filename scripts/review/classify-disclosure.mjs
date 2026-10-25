// Classify verbatim Steam AI disclosures into the site's 8 areas with a small, cheap model.
// Only games whose facts have route "official" are sent. Input per game is just the disclosure text
// (usually 1-3 sentences), so a call costs a few hundred tokens instead of a full agent research session.
//
// Usage: ANTHROPIC_API_KEY=... node scripts/review/classify-disclosure.mjs [appId...]
//        (no IDs = every facts/*.json with route "official" and no classification yet)
// Env:   CLASSIFY_MODEL (default claude-haiku-5-5)
// Output: adds `classification` to scripts/review/facts/<appId>.json

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FACTS = join(HERE, 'facts');
const MODEL = process.env.CLASSIFY_MODEL || 'claude-haiku-5-5';
const AREAS = ['ingame', 'code', 'art', 'music', 'voice', 'writing', 'translation', 'marketing'];

// Rules copied from docs/AGENT_HANDOFF.md §2.5. Kept as a fixed system block so it can be prompt-cached.
const RULES = `你在为 Game AI Checker 把 Steam「AI Generated Content Disclosure」披露原文归类到 8 个领域。
领域：ingame(游玩时实时生成内容/玩法内 AI)、code(代码)、art(角色/场景/UI/贴图/宣传图以外的游戏内视觉)、music(音乐与音效)、voice(配音/旁白/TTS)、writing(故事/对白/任务文本)、translation(本地化/翻译)、marketing(商店图/预告/宣传素材)。
每个领域的状态只能是：
- used：原文明确说该领域用了生成式 AI
- none：原文明确说该领域没有用（例如“游玩时不生成 AI 内容”→ ingame: none）
- claimed_none：原文自称该领域由人工制作（例如“音乐由人工制作”）
- not_stated：原文没提到
规则：
1. 只标原文明确说到的领域，不推测。“textures”属于 art；“audio assets”未区分音乐和音效时归 music 并在说明里写明未区分。
2. 披露只说“部分素材/内容用了 AI”而没说是哪类时：aiScopeUnspecified=true，8 个领域全部 not_stated。
3. 玩家在游戏里实时生成内容的功能归 ingame，不归 art。
4. 只用于开发辅助（如 Copilot 写代码）且原文明说的，标 code: used。
5. 说明（notes）用简体中文，一句话，以“开发者披露”或“开发者在披露中称”开头，忠实转述原文，不加评价；只为状态不是 not_stated 的领域写说明。
6. desc：根据提供的商店简介写一句不超过 50 字的中文游戏简介（只描述游戏内容，不提 AI）。
7. quote：原文第一句，逐字照抄，不翻译。`;

const TOOL = {
  name: 'record_classification',
  description: '记录披露分类结果',
  input_schema: {
    type: 'object',
    properties: {
      aiScopeUnspecified: { type: 'boolean' },
      areas: {
        type: 'object',
        properties: Object.fromEntries(AREAS.map((a) => [a, { type: 'string', enum: ['used', 'none', 'claimed_none', 'not_stated'] }])),
        required: AREAS,
      },
      notes: { type: 'object', additionalProperties: { type: 'string' } },
      desc: { type: 'string' },
      quote: { type: 'string' },
    },
    required: ['aiScopeUnspecified', 'areas', 'notes', 'desc', 'quote'],
  },
};

async function classify(fact) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      system: [{ type: 'text', text: RULES, cache_control: { type: 'ephemeral' } }],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{
        role: 'user',
        content: `游戏：${fact.name}\n商店简介：${fact.descZh || fact.descEn}\n\n披露原文：\n${fact.disclosure || '（披露栏存在但为空）'}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const out = body.content.find((c) => c.type === 'tool_use')?.input;
  if (!out) throw new Error('no tool output');

  // Deterministic guards so a model slip cannot invent areas.
  if (out.aiScopeUnspecified) for (const a of AREAS) out.areas[a] = 'not_stated';
  for (const a of Object.keys(out.notes)) if (!AREAS.includes(a) || out.areas[a] === 'not_stated') delete out.notes[a];
  if (fact.disclosure && !fact.disclosure.includes(out.quote.trim())) out.quote = fact.disclosure.split(/(?<=[.!?。])\s/)[0];
  return { ...out, model: MODEL, usage: body.usage, classifiedAt: new Date().toISOString(), needsHumanCheck: true };
}

const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
const files = ids.length ? ids.map((i) => `${i}.json`) : readdirSync(FACTS).filter((f) => /^\d+\.json$/.test(f));
let input = 0, output = 0, n = 0;
for (const f of files) {
  const p = join(FACTS, f);
  const fact = JSON.parse(readFileSync(p, 'utf8'));
  if (fact.route !== 'official' || (fact.classification && !ids.length)) continue;
  try {
    fact.classification = await classify(fact);
    writeFileSync(p, `${JSON.stringify(fact, null, 2)}\n`);
    input += fact.classification.usage?.input_tokens || 0;
    output += fact.classification.usage?.output_tokens || 0;
    n++;
    const used = Object.entries(fact.classification.areas).filter(([, v]) => v !== 'not_stated').map(([k, v]) => `${k}:${v}`);
    console.log(`${fact.appId} ${fact.name}: ${used.join(', ') || (fact.classification.aiScopeUnspecified ? 'scope unspecified' : '-')}`);
  } catch (e) {
    console.error(`${fact.appId}: ${e.message}`);
  }
}
console.log(`\nclassified ${n} · tokens in ${input} / out ${output}`);
