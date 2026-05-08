# Phase 7a — Schema-drift + mirror-parity linters

> Modular Phase 7 deliverable. Independent of the Phase 6 cutover; can land at any time.

## Goal

Encode two static invariants the team has historically broken by hand and which
TypeScript alone does not catch:

1. **Schema-vs-prompt-vs-parser drift** — every key in `responseSchema.required`
   must be (a) mentioned by exact name in the agent's system prompt and (b) read
   by the agent's parser.
2. **Mirror parity** — every file under `src/lib/agents/<slug>/` (or
   `src/lib/agents/_shared/`) that has a same-basename twin under
   `supabase/functions/agents/<slug>/` (or `supabase/functions/_shared/`) must be
   byte-for-byte identical, modulo the file-header JSDoc and structural import
   differences (Deno's `.ts` extensions, depth-of-`_shared` differences between
   the two trees).

Both lints catch a different class of bug; together they fence off the most
common silent regressions in the multi-agent dispatcher.

## Inputs

- Phases 0–5 merged (the canonical strategy modules under `src/lib/agents/<slug>/`
  and their Deno mirrors must exist).
- No dependency on the Phase 6 cutover; can land before or after.

## Deliverables

| File                                                                                                          | Purpose                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [`scripts/check-agent-prompt-schema-drift.ts`](../../../scripts/check-agent-prompt-schema-drift.ts)           | Schema/prompt/parser drift linter (3 rule directions per contract).                                                                        |
| [`scripts/check-agent-prompt-schema-drift.test.ts`](../../../scripts/check-agent-prompt-schema-drift.test.ts) | Live-baseline + 7 synthetic-contract self-tests.                                                                                           |
| [`scripts/check-agent-mirror-parity.ts`](../../../scripts/check-agent-mirror-parity.ts)                       | Vitest-canonical ↔ Deno-mirror byte-for-byte parity linter.                                                                                |
| [`scripts/check-agent-mirror-parity.test.ts`](../../../scripts/check-agent-mirror-parity.test.ts)             | Live-baseline + pure-helper + 4 synthetic-pair self-tests (20 total).                                                                      |
| [`package.json`](../../../package.json)                                                                       | New `check:agent-prompts` and `check:agent-mirror` scripts; chained into `test`, `test:coverage`, and `check`.                             |
| [`vitest.config.ts`](../../../vitest.config.ts)                                                               | `include` extended to `scripts/**/*.test.ts` so the self-tests run.                                                                        |
| 22 file-header sweeps                                                                                         | Replace "Phase 7 will add a drift-detection lint" with "Run `pnpm check:agent-mirror` to verify parity" across canonical + mirror modules. |

## Script 1 — schema/prompt/parser drift

[`scripts/check-agent-prompt-schema-drift.ts`](../../../scripts/check-agent-prompt-schema-drift.ts)

A typed `Contract` registry pins each `(slug, schema, prompt, parserSourcePath)`
triple. The script applies three rules per contract:

| Rule                               | Direction                                                                                 | What it catches                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `required-key-missing-from-prompt` | `responseSchema.required ⊆ prompt`                                                        | Key required by schema but the prompt never names it (model has no idea the key exists).                   |
| `prompt-key-missing-from-schema`   | prompt-mentioned schema-key-shaped tokens ⊆ `properties ∪ enum values ∪ promptOnlyTokens` | Refactor renamed a property in `schema.ts` but the prompt still uses the old name.                         |
| `required-key-missing-from-parser` | `responseSchema.required ⊆ parser source text`                                            | Required key was added to the schema but the parser never reads it (dispatcher silently gets `undefined`). |

**Token matcher:** word-bounded
(`(?:^|[^A-Za-z0-9_])<key>(?:$|[^A-Za-z0-9_])`). Snake*case and camelCase keys
both match cleanly because `*` and letter/digit are word-chars.

**Direction-B heuristic:** `extractSchemaKeyShapedTokens` only flags tokens that
are lowercase-leading AND contain at least one underscore (snake_case) or
internal capital letter (camelCase). Single English words (`title`,
`description`, `payload`) and caps-leading sentinels (`SYSTEM_EVENT`,
`BuddyBubble`) are intentionally excluded to avoid false positives.

**Allowlists per contract:**

- `schemaOnlyKeys: ['key']` — the model is expected to know about a required key
  implicitly (e.g. the Coach workout-open silent-greeting whose 1-key schema is
  conveyed in prose: "write ONE chat message").
- `promptOnlyTokens: ['workoutContext']` — tokens that look like schema keys but
  are runtime-context block names, prose example values (Buddy's `action_type`
  examples), naming-convention meta-terms ("snake_case"), or file-name
  references (`organizerPrompt`).

## Script 2 — mirror parity

[`scripts/check-agent-mirror-parity.ts`](../../../scripts/check-agent-mirror-parity.ts)

**Pair discovery:** walk `src/lib/agents/**/*.ts` (skipping `*.test.ts`); for
each file, compute the equivalent Deno path via `denoMirrorPathOf`. If both
files exist on disk, it is a mirror pair. If only one exists, the file is
intentionally Vitest-only (a test) or Deno-only (e.g. `strategy.ts`,
`context.ts`); skipped silently. This makes the script robust to future
strategies — naming convention enforces intent.

**Path mapping:**

```
src/lib/agents/coach/parse.ts          → supabase/functions/agents/coach/parse.ts
src/lib/agents/_shared/llm/types.ts    → supabase/functions/_shared/llm/types.ts
src/lib/agents/_shared/dispatch/types.ts → supabase/functions/_shared/dispatch/types.ts
```

**Three normalizations before SHA-256 compare:**

1. `stripLeadingJsDoc` — drop the file's leading `/** ... */` block (canonical
   and mirror have intentionally different headers).
2. `normalizeRelativeImports` — strip `.ts` extension AND leading `./`/`../`
   segments from any relative import. This makes `'../_shared/llm/types'`
   (Vitest, where `_shared` lives under `src/lib/agents/`) compare equal to
   `'../../_shared/llm/types.ts'` (Deno, where `_shared` lives under
   `supabase/functions/`). Both resolve to logically the same module — the
   depth difference is a tree-shape artifact, not drift.
3. CRLF → LF.

**On mismatch:** report the first 1-based diverging line in the normalized
bodies plus both SHA-256 hashes. Concise enough to skim in CI logs but specific
enough to jump straight to the divergence with `pnpm exec git diff`.

## CI wiring

[`package.json`](../../../package.json) chains the three lint scripts in a
deterministic order: cheapest static rules first, then structural rules, then
Vitest.

```text
pnpm test = check-agent-coupling → check-agent-prompt-schema-drift → check-agent-mirror-parity → vitest run
pnpm check = format:check → lint → check-agent-coupling → check-agent-prompts → check-agent-mirror → lint:eslint → build → check:storefront
```

No new runtime dependencies: both scripts use only `node:fs`, `node:crypto`, and
`node:path`, plus relative imports from `src/lib/agents/`.

## Adding a new strategy

When porting `<newslug>` to `agent-dispatch`:

1. Drop the canonical pure modules at `src/lib/agents/<newslug>/{schema,prompts,parse,config}.ts`.
2. Mirror them byte-for-byte to `supabase/functions/agents/<newslug>/{schema,prompts,parse,config}.ts`.
3. Append a new entry to `REGISTRY` in
   [`scripts/check-agent-prompt-schema-drift.ts`](../../../scripts/check-agent-prompt-schema-drift.ts):

   ```ts
   {
     name: '<newslug>.main',
     slug: '<newslug>',
     schema: NEWSLUG_RESPONSE_SCHEMA,
     prompt: newslugSystemPrompt,            // or builder(...) if context-dependent
     parserSourcePath: 'src/lib/agents/<newslug>/parse.ts',
     schemaOnlyKeys: [],
     promptOnlyTokens: [],
   }
   ```

4. Run `pnpm check:agent-prompts`. If it flags a token, decide whether to:
   - Add the key to the prompt (preferred — the model needs to know about it).
   - Add to `schemaOnlyKeys` (only if the key is conveyed implicitly in prose).
   - Add to `promptOnlyTokens` (only if the prompt mentions a runtime-context
     block name or prose example that legitimately is not a schema key).
5. Run `pnpm check:agent-mirror`. The new pair is auto-discovered; no script
   change needed.

## Verification

Run all four locally before opening the PR:

```bash
pnpm check:agent-prompts          # exit 0
pnpm check:agent-mirror           # exit 0
pnpm test                         # full chain exits 0
pnpm exec tsc --noEmit            # clean
```

**Manual sabotage smoke tests** (revert before committing):

- Rename `replyContent` → `replyContentX` in
  [`src/lib/agents/buddy/schema.ts`](../../../src/lib/agents/buddy/schema.ts).
  Expect `pnpm check:agent-prompts` to fail with both
  `required-key-missing-from-prompt` AND `required-key-missing-from-parser`
  rule ids on `buddy.main`.
- Change one byte in the body of
  [`supabase/functions/agents/buddy/schema.ts`](../../../supabase/functions/agents/buddy/schema.ts).
  Expect `pnpm check:agent-mirror` to fail with the diverging-line message and
  both hashes printed.

## Real drift caught at ship time

The very first run of `pnpm check:agent-mirror` against the live repo flagged
two mirror pairs that had silently drifted:

- `src/lib/agents/_shared/llm/types.ts` — Vitest mirror was missing a JSDoc
  bullet list on `VertexErrorKind` that had been added on the Deno canonical
  side.
- `src/lib/agents/organizer/config.ts` — Vitest canonical was missing an inline
  JSDoc on `ORGANIZER_SLUG` that had been added on the Deno mirror.

Both were fixed in this same PR (one-line surgical edits to bring the mirrors
back in sync) so the linter exits clean on the live registry.

## Risks (and mitigations)

- **Substring search false positives in parser source.** Today all parsers read
  required keys via `obj.<key>` / `c.<key>` / `pw.<key>` access patterns, so
  substring matching is safe. If a future parser computes keys dynamically, add
  a comment-strip pre-pass before the substring scan.
- **Header-strip regex too aggressive.** Conservative: only strips the FIRST
  top-of-file `/** ... */` block. Inline JSDoc on subsequent declarations is
  preserved. Tested in `check-agent-mirror-parity.test.ts`.
- **Coach prompt evolves to a context-dependent builder.** The contract registry
  pins the builder call with a fixed fixture (`buildBaseCoachPrompt('2026-01-01')`).
  If a new param is added to the builder, the registry breaks at TypeScript
  compile time, forcing an explicit decision.
- **Aggressive relative-import normalization could mask intentional import
  drift.** Acceptable trade-off: when the modules a mirror pair imports differ,
  the BODIES of those imported modules are themselves checked by the same
  linter (or by direction-C / TypeScript), so the surface drift would be caught
  downstream.

## Hand-off to remaining Phase 7 work

Future Phase 7 deliverables (Deno integration tests, observability
documentation) can assume schema/prompt/parser/mirror invariants are
CI-enforced and skip writing per-key parity asserts in their own test suites.
