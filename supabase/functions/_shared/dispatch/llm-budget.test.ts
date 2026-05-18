import { assertEquals } from 'jsr:@std/assert@1';
import {
  computeLlmBudgetMs,
  DISPATCH_WALL_CLOCK_CAP_MS,
  FALLBACK_RESERVE_MS,
  MIN_LLM_BUDGET_MS,
} from './llm-budget.ts';

Deno.test('computeLlmBudgetMs subtracts reserve from configured timeout', () => {
  const start = 0;
  const budget = computeLlmBudgetMs(60_000, start, start);
  assertEquals(budget, DISPATCH_WALL_CLOCK_CAP_MS - FALLBACK_RESERVE_MS);
});

Deno.test('computeLlmBudgetMs respects wall clock cap', () => {
  const start = 0;
  const budget = computeLlmBudgetMs(60_000, start, DISPATCH_WALL_CLOCK_CAP_MS - 1_000);
  assertEquals(budget, MIN_LLM_BUDGET_MS);
});

Deno.test('computeLlmBudgetMs never below minimum', () => {
  const budget = computeLlmBudgetMs(1_000, 0, DISPATCH_WALL_CLOCK_CAP_MS);
  assertEquals(budget, MIN_LLM_BUDGET_MS);
});
