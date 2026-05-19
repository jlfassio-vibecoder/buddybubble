/**
 * Server-side `card_action` inference when the model promises generation in prose
 * but omits structured `card_action` in JSON.
 */

import type { CoachGeminiJsonResponse } from './parse.ts';

/** Coach copy for "I'm starting the generator" without persisting card_action. */
export const GENERATOR_REPLY_RE =
  /\b(starting the generator|starting the workout generator|run the generator|starting the generator now)\b/i;

const CONSENT_RE =
  /\b(go ahead|yes[,.]?\s*(please\s+)?(draft|generate)|draft (it|the|my|now)|generate (it|now|the workout|again)|please draft|try to generate)\b/i;

/** Title/description canvas edits must not trigger workout generation hand-off. */
const CANVAS_FIELD_EDIT_RE =
  /\b(title\s+and\s+description|add\s+(a\s+)?(title|description)|set\s+(the\s+)?(title|description)|update\s+(the\s+)?(title|description))\b/i;

export function userMessageShowsGenerateConsent(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  if (CANVAS_FIELD_EDIT_RE.test(t)) return false;
  return CONSENT_RE.test(t);
}

export type InferCardActionArgs = {
  isRailSurface: boolean;
  currentWorkoutContextJson: string | null;
  triggerContent: string;
  parsed: CoachGeminiJsonResponse;
};

/**
 * Returns `trigger_generation` when rail + no rich workout context + user consent +
 * generator phrasing, and the model left `card_action` null without creating a card.
 */
export function inferCardActionTriggerGeneration(
  args: InferCardActionArgs,
): 'trigger_generation' | null {
  if (!args.isRailSurface) return null;
  if (args.currentWorkoutContextJson != null) return null;
  if (args.parsed.create_card) return null;
  if (args.parsed.card_action === 'trigger_generation') return null;
  if (!userMessageShowsGenerateConsent(args.triggerContent)) return null;
  const reply = typeof args.parsed.reply_content === 'string' ? args.parsed.reply_content : '';
  if (!GENERATOR_REPLY_RE.test(reply)) return null;
  return 'trigger_generation';
}
