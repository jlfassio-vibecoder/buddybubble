/**
 * Canonical Vitest coverage for Buddy's pure parser.
 *
 * Buddy's parser is the most permissive of the three agents — Buddy is allowed to
 * wrap its JSON in markdown fences and prose, so the tests here document the full
 * shape of what the dispatcher will tolerate. Anything looser is a regression.
 *
 * Lift map: legacy parser at supabase/functions/buddy-agent-dispatch/index.ts:581-723.
 */

import { describe, expect, it } from 'vitest';

import { BUDDY_ONBOARDING_SENTINEL, BUDDY_SAFE_REPLY_TEXT, BUDDY_SLUG } from './config';
import {
  extractGeminiCandidateText,
  parseBuddyResponse,
  sanitizeBuddyModelJsonText,
  stripJsonCodeFences,
} from './parse';
import { buddySystemPrompt } from './prompts';

describe('buddy config invariants', () => {
  it('exposes the canonical slug and onboarding sentinel', () => {
    expect(BUDDY_SLUG).toBe('buddy');
    expect(BUDDY_ONBOARDING_SENTINEL).toBe('[SYSTEM_EVENT: ONBOARDING_STARTED]');
  });

  it('has a non-empty fallback reply text', () => {
    expect(BUDDY_SAFE_REPLY_TEXT.trim().length).toBeGreaterThan(0);
  });
});

describe('buddy system prompt (scope invariants)', () => {
  it('orients Buddy around onboarding + Bubbleboard guidance', () => {
    expect(buddySystemPrompt).toMatch(/onboarding/i);
    expect(buddySystemPrompt).toMatch(/Bubbleboard/);
  });

  it('redirects fitness asks to @Coach without prescribing workouts', () => {
    expect(buddySystemPrompt).toMatch(/@Coach/);
    expect(buddySystemPrompt).toMatch(/NOT a fitness coach/i);
    // Buddy's prompt MUST contain a "do not prescribe workouts" guard. The earlier
    // negative-match version mis-modeled this on the Organizer prompt.
    expect(buddySystemPrompt).toMatch(/do not prescribe workouts/i);
  });

  it('forbids echoing the onboarding sentinel back to the user', () => {
    expect(buddySystemPrompt).toMatch(/Never echo the sentinel/i);
    expect(buddySystemPrompt).toMatch(/SYSTEM_EVENT: ONBOARDING_STARTED/);
  });
});

describe('extractGeminiCandidateText', () => {
  it('joins every text part in order', () => {
    const candidate = {
      content: { parts: [{ text: 'first ' }, { text: 'second' }] },
    };
    expect(extractGeminiCandidateText(candidate)).toBe('first second');
  });

  it('returns empty string when parts are missing or non-array', () => {
    expect(extractGeminiCandidateText(undefined)).toBe('');
    expect(extractGeminiCandidateText({ content: {} })).toBe('');
    expect(extractGeminiCandidateText({ content: { parts: 'oops' as unknown as never } })).toBe('');
  });

  it('skips parts whose text is not a string', () => {
    const candidate = {
      content: {
        parts: [{ text: 'a' }, { text: undefined as unknown as string }, { text: 'b' }],
      },
    };
    expect(extractGeminiCandidateText(candidate)).toBe('ab');
  });
});

describe('stripJsonCodeFences', () => {
  it('peels a complete ```json block', () => {
    const fenced = '```json\n{"replyContent": "hi"}\n```';
    expect(stripJsonCodeFences(fenced)).toBe('{"replyContent": "hi"}');
  });

  it('peels a fenceless ``` block', () => {
    const fenced = '```\n{"replyContent": "hi"}\n```';
    expect(stripJsonCodeFences(fenced)).toBe('{"replyContent": "hi"}');
  });

  it('handles an opening fence with no closing fence', () => {
    const broken = '```json\n{"replyContent": "hi"}';
    expect(stripJsonCodeFences(broken)).toBe('{"replyContent": "hi"}');
  });
});

describe('sanitizeBuddyModelJsonText', () => {
  it('strips a leading BOM', () => {
    const withBom = '\uFEFF{"replyContent": "hi"}';
    expect(sanitizeBuddyModelJsonText(withBom)).toBe('{"replyContent": "hi"}');
  });

  it('strips an "Ok, here is the JSON:" prelude', () => {
    const noisy = 'Ok, here\'s the JSON:\n{"replyContent": "hi"}';
    expect(sanitizeBuddyModelJsonText(noisy)).toBe('{"replyContent": "hi"}');
  });
});

describe('parseBuddyResponse — happy paths', () => {
  it('parses a direct JSON object', () => {
    const text = '{"replyContent": "Welcome!", "createCard": null}';
    const parsed = parseBuddyResponse(text);
    expect(parsed).toEqual({ replyContent: 'Welcome!', createCard: null });
  });

  it('parses a ```json``` fenced response', () => {
    const text = '```json\n{"replyContent": "Welcome!"}\n```';
    const parsed = parseBuddyResponse(text);
    expect(parsed).toEqual({ replyContent: 'Welcome!', createCard: null });
  });

  it('parses a ``` (no language) fenced response', () => {
    const text = '```\n{"replyContent": "Welcome!"}\n```';
    const parsed = parseBuddyResponse(text);
    expect(parsed).toEqual({ replyContent: 'Welcome!', createCard: null });
  });

  it('parses a fence-only-open response (model forgot the closing fence)', () => {
    const text = '```json\n{"replyContent": "Welcome!"}';
    const parsed = parseBuddyResponse(text);
    expect(parsed).toEqual({ replyContent: 'Welcome!', createCard: null });
  });

  it('parses a prose-prefixed JSON object', () => {
    const text = 'Sure! Here is your reply.\n\n{"replyContent": "Welcome!"}';
    const parsed = parseBuddyResponse(text);
    expect(parsed).toEqual({ replyContent: 'Welcome!', createCard: null });
  });

  it('parses a leading-BOM JSON object', () => {
    const text = '\uFEFF{"replyContent": "Welcome!"}';
    const parsed = parseBuddyResponse(text);
    expect(parsed).toEqual({ replyContent: 'Welcome!', createCard: null });
  });

  it('walks past a junk { candidate to find the real JSON object', () => {
    // First `{` is balanced but NOT valid JSON (bare identifiers); the walker must
    // try the next `{` start and find the real object on the second pass.
    const text = 'Note: {oops not valid JSON} ... actual response: {"replyContent": "Hi!"}';
    const parsed = parseBuddyResponse(text);
    expect(parsed).toEqual({ replyContent: 'Hi!', createCard: null });
  });

  it('returns a fully-formed createCard when all three card fields are non-empty', () => {
    const text = JSON.stringify({
      replyContent: 'Tap below to start.',
      createCard: {
        title: '  Set up your first bubble  ',
        description: 'Step 1: name it. Step 2: invite a friend.',
        action_type: 'create_first_bubble',
      },
    });
    const parsed = parseBuddyResponse(text);
    expect(parsed).toEqual({
      replyContent: 'Tap below to start.',
      createCard: {
        title: 'Set up your first bubble',
        description: 'Step 1: name it. Step 2: invite a friend.',
        action_type: 'create_first_bubble',
      },
    });
  });

  it('clamps card titles longer than 100 characters', () => {
    const longTitle = 'a'.repeat(150);
    const text = JSON.stringify({
      replyContent: 'ok',
      createCard: {
        title: longTitle,
        description: 'desc',
        action_type: 'tag',
      },
    });
    const parsed = parseBuddyResponse(text);
    expect(parsed?.createCard?.title.length).toBe(100);
  });
});

describe('parseBuddyResponse — rejection paths', () => {
  it('returns null when JSON cannot be parsed', () => {
    expect(parseBuddyResponse('not json')).toBeNull();
  });

  it('returns null when the parsed value is not an object', () => {
    expect(parseBuddyResponse('"just a string"')).toBeNull();
    expect(parseBuddyResponse('[1, 2, 3]')).toBeNull();
  });

  it('returns null when replyContent is missing', () => {
    expect(parseBuddyResponse('{"createCard": null}')).toBeNull();
  });

  it('returns null when replyContent is not a string', () => {
    expect(parseBuddyResponse('{"replyContent": 42}')).toBeNull();
  });

  it('returns null when replyContent is empty after trimming', () => {
    expect(parseBuddyResponse('{"replyContent": "   "}')).toBeNull();
  });

  it('preserves replyContent and drops the card when createCard.title is missing', () => {
    const text = JSON.stringify({
      replyContent: 'Reply still lands.',
      createCard: { description: 'desc', action_type: 'tag' },
    });
    expect(parseBuddyResponse(text)).toEqual({
      replyContent: 'Reply still lands.',
      createCard: null,
    });
  });

  it('drops the card when description is empty', () => {
    const text = JSON.stringify({
      replyContent: 'Reply still lands.',
      createCard: { title: 'title', description: '   ', action_type: 'tag' },
    });
    expect(parseBuddyResponse(text)).toEqual({
      replyContent: 'Reply still lands.',
      createCard: null,
    });
  });

  it('drops the card when action_type is missing', () => {
    const text = JSON.stringify({
      replyContent: 'Reply still lands.',
      createCard: { title: 'title', description: 'desc' },
    });
    expect(parseBuddyResponse(text)).toEqual({
      replyContent: 'Reply still lands.',
      createCard: null,
    });
  });

  it('preserves createCard:null exactly', () => {
    const text = '{"replyContent": "hi", "createCard": null}';
    expect(parseBuddyResponse(text)).toEqual({ replyContent: 'hi', createCard: null });
  });
});
