import { assertEquals } from 'jsr:@std/assert@1';
import {
  computeLlmBudgetMs,
  effectiveDispatchWallClockCapMs,
  FALLBACK_RESERVE_MS,
  LEGACY_DISPATCH_WALL_CLOCK_CAP_MS,
  MIN_LLM_BUDGET_MS,
} from './llm-budget.ts';

Deno.test('effectiveDispatchWallClockCapMs grows with configured timeout', () => {
  assertEquals(effectiveDispatchWallClockCapMs(60_000), 74_000);
  assertEquals(effectiveDispatchWallClockCapMs(75_000), 75_000);
  assertEquals(effectiveDispatchWallClockCapMs(90_000), 75_000);
});

Deno.test('computeLlmBudgetMs uses configured timeout when wall cap allows', () => {
  const start = 0;
  const budget = computeLlmBudgetMs(75_000, start, start);
  assertEquals(budget, 75_000 - FALLBACK_RESERVE_MS);
});

Deno.test('computeLlmBudgetMs clamps to wall cap when configured exceeds 75s', () => {
  const start = 0;
  const budget = computeLlmBudgetMs(90_000, start, start);
  assertEquals(budget, 75_000 - FALLBACK_RESERVE_MS);
});

Deno.test('computeLlmBudgetMs legacy 60s config is not clipped to 43s', () => {
  const start = 0;
  const budget = computeLlmBudgetMs(60_000, start, start);
  assertEquals(budget, 60_000 - FALLBACK_RESERVE_MS);
  assertEquals(budget > LEGACY_DISPATCH_WALL_CLOCK_CAP_MS - FALLBACK_RESERVE_MS, true);
});

Deno.test('computeLlmBudgetMs respects wall clock cap near deadline', () => {
  const start = 0;
  const wall = effectiveDispatchWallClockCapMs(60_000);
  const budget = computeLlmBudgetMs(60_000, start, wall - 1_000);
  assertEquals(budget, MIN_LLM_BUDGET_MS);
});

Deno.test('computeLlmBudgetMs never below minimum', () => {
  const budget = computeLlmBudgetMs(1_000, 0, LEGACY_DISPATCH_WALL_CLOCK_CAP_MS);
  assertEquals(budget, MIN_LLM_BUDGET_MS);
});
