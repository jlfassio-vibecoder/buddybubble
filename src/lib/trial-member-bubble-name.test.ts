import { describe, expect, it } from 'vitest';
import {
  GUEST_BUBBLE_NAME_PREFIX,
  TRIAL_BUBBLE_NAME_PREFIX,
  memberBubbleDisplayName,
  stripTrialBubbleNamePrefix,
} from './trial-member-bubble-name';

describe('stripTrialBubbleNamePrefix', () => {
  it('strips the storefront Trial · prefix', () => {
    expect(stripTrialBubbleNamePrefix(`${TRIAL_BUBBLE_NAME_PREFIX}justin`)).toBe('justin');
  });

  it('leaves other names unchanged', () => {
    expect(stripTrialBubbleNamePrefix('justin')).toBe('justin');
    expect(stripTrialBubbleNamePrefix('trial justin')).toBe('trial justin');
  });
});

describe('memberBubbleDisplayName', () => {
  it('drops Trial · for member without inventing Member', () => {
    expect(
      memberBubbleDisplayName({
        previousName: `${TRIAL_BUBBLE_NAME_PREFIX}justin`,
        newRole: 'member',
      }),
    ).toBe('justin');
    expect(
      memberBubbleDisplayName({
        previousName: `${TRIAL_BUBBLE_NAME_PREFIX}justin`,
        newRole: 'member',
      }),
    ).not.toMatch(/Member/i);
  });

  it('uses Guest · as the only non-redundant level', () => {
    expect(
      memberBubbleDisplayName({
        previousName: `${TRIAL_BUBBLE_NAME_PREFIX}justin`,
        newRole: 'guest',
      }),
    ).toBe(`${GUEST_BUBBLE_NAME_PREFIX}justin`);
  });

  it('is idempotent for bare member names', () => {
    expect(memberBubbleDisplayName({ previousName: 'justin', newRole: 'member' })).toBe('justin');
  });

  it('does not double-prefix Guest ·', () => {
    expect(
      memberBubbleDisplayName({
        previousName: `${GUEST_BUBBLE_NAME_PREFIX}justin`,
        newRole: 'guest',
      }),
    ).toBe(`${GUEST_BUBBLE_NAME_PREFIX}justin`);
  });

  it('strips Guest · when promoting guest to member', () => {
    expect(
      memberBubbleDisplayName({
        previousName: `${GUEST_BUBBLE_NAME_PREFIX}justin`,
        newRole: 'member',
      }),
    ).toBe('justin');
  });

  it('uses bare name for admin and owner', () => {
    expect(
      memberBubbleDisplayName({
        previousName: `${TRIAL_BUBBLE_NAME_PREFIX}justin`,
        newRole: 'admin',
      }),
    ).toBe('justin');
    expect(
      memberBubbleDisplayName({
        previousName: `${TRIAL_BUBBLE_NAME_PREFIX}justin`,
        newRole: 'owner',
      }),
    ).toBe('justin');
  });
});
