/**
 * Pure phase-transition graph for the storefront hero.
 *
 * `canTransition(from, to, categoryType)` is the single source of truth for whether
 * a transition is allowed. `nextAfter` / `previousOf` are convenience helpers used
 * by default Next/Back buttons; they always produce an edge that passes `canTransition`.
 *
 * Deviations from the brief's listed edges (documented in the companion summary):
 *  - `outline → profile` back-edge is allowed (verification checklist requires Back at
 *    every phase, and outline would otherwise have no back target).
 *  - `email → outline` is allowed for `business` only (since refine is skipped there,
 *    email back needs to land on outline).
 */

const FITNESS_EDGES = new Set([
  'idle|profile',
  'profile|outline',
  'profile|idle',
  'outline|refine',
  'outline|profile',
  'refine|email',
  'refine|outline',
  'email|loading',
  'email|refine',
  'loading|idle',
]);

const BUSINESS_EDGES = new Set([
  'idle|profile',
  'profile|outline',
  'profile|idle',
  'outline|email',
  'outline|profile',
  'email|loading',
  'email|outline',
  'loading|idle',
]);

function edgesFor(categoryType) {
  return categoryType === 'business' ? BUSINESS_EDGES : FITNESS_EDGES;
}

export function canTransition(from, to, categoryType = 'fitness') {
  return edgesFor(categoryType).has(`${from}|${to}`);
}

export function nextAfter(phase, categoryType = 'fitness') {
  switch (phase) {
    case 'idle':
      return 'profile';
    case 'profile':
      return 'outline';
    case 'outline':
      return categoryType === 'fitness' ? 'refine' : 'email';
    case 'refine':
      return 'email';
    case 'email':
      return 'loading';
    default:
      return phase;
  }
}

export function previousOf(phase, categoryType = 'fitness') {
  switch (phase) {
    case 'profile':
      return 'idle';
    case 'outline':
      return 'profile';
    case 'refine':
      return 'outline';
    case 'email':
      return categoryType === 'fitness' ? 'refine' : 'outline';
    case 'loading':
      return 'idle';
    default:
      return phase;
  }
}
