/**
 * MIRROR FILE — canonical lives at `src/lib/agents/buddy/parse.ts`.
 *
 * Body below is byte-for-byte identical to the canonical Vitest-side file (excluding
 * this header). Any change must be hand-mirrored — run `pnpm check:agent-mirror` to
 * verify parity.
 *
 * No relative imports → import paths are identical between Node and Deno builds for
 * this module.
 */

export type BuddyCreateCard = {
  title: string;
  description: string;
  action_type: string;
};

export type BuddyParsedResponse = {
  replyContent: string;
  createCard: BuddyCreateCard | null;
};

/** Concatenate every text part in a Gemini candidate envelope. */
export function extractGeminiCandidateText(
  candidate: { content?: { parts?: Array<{ text?: string }> } } | undefined,
): string {
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
}

/**
 * Balanced `{ ... }` slice starting at `start` (must be `{`). String-aware so `{`
 * inside JSON strings does not confuse depth.
 */
export function extractBalancedJsonAt(s: string, start: number): string | null {
  if (s[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export function stripJsonCodeFences(raw: string): string {
  let t = raw.trim();
  // Whole string is one fenced block: ```json ... ``` or ``` ... ```
  const fullFence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i;
  const m = t.match(fullFence);
  if (m?.[1]) return m[1].trim();
  // Opening fence only (model forgot closing ```)
  if (/^```(?:json)?\s*/i.test(t)) {
    t = t.replace(/^```(?:json)?\s*/i, '');
    t = t.replace(/\r?\n?```\s*$/i, '');
  }
  return t.trim();
}

/** Strip BOM, markdown fences, and common LLM wrappers before JSON.parse. */
export function sanitizeBuddyModelJsonText(raw: string): string {
  let t = raw.replace(/^\uFEFF/, '').trim();
  t = stripJsonCodeFences(t);
  t = t
    .replace(
      /^(?:ok[,.\s]*)?(?:here(?:'s| is| are)\s+)?(?:the\s+)?(?:json|response|output)\s*[:.\s-]*\r?\n?/i,
      '',
    )
    .trim();
  return t;
}

export function parseBuddyJsonObject(cleaned: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const direct = tryParse(cleaned);
  if (direct) return direct;

  // Try every `{` start: prose may contain a spurious `{...}` before the real JSON object.
  let search = 0;
  while (search < cleaned.length) {
    const start = cleaned.indexOf('{', search);
    if (start < 0) break;
    const extracted = extractBalancedJsonAt(cleaned, start);
    if (extracted) {
      const parsed = tryParse(extracted);
      if (parsed) return parsed;
    }
    search = start + 1;
  }
  return null;
}

export function parseBuddyResponse(rawText: string): BuddyParsedResponse | null {
  const cleaned = sanitizeBuddyModelJsonText(rawText);
  if (!cleaned) return null;

  const obj = parseBuddyJsonObject(cleaned);
  if (!obj) return null;

  const replyContentRaw = obj.replyContent;
  if (typeof replyContentRaw !== 'string') return null;
  const replyContent = replyContentRaw.trim();
  if (!replyContent) return null;

  let createCard: BuddyCreateCard | null = null;
  const cardRaw = obj.createCard;
  if (cardRaw && typeof cardRaw === 'object' && !Array.isArray(cardRaw)) {
    const c = cardRaw as Record<string, unknown>;
    const titleRaw = typeof c.title === 'string' ? c.title.trim() : '';
    const descRaw = typeof c.description === 'string' ? c.description.trim() : '';
    const actionRaw = typeof c.action_type === 'string' ? c.action_type.trim() : '';
    // Require all three fields to be non-empty strings; otherwise drop the card rather
    // than write a malformed Kanban row.
    if (titleRaw && descRaw && actionRaw) {
      createCard = {
        title: titleRaw.slice(0, 100),
        description: descRaw,
        action_type: actionRaw,
      };
    }
  }

  return { replyContent, createCard };
}
