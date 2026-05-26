import { describe, expect, it } from 'vitest';
import {
  buildOutlineHistoryTexts,
  filterHumanMessages,
  messageHasCatalogToken,
  pickBestHumanOutlineMessage,
  type OutlineMessageRow,
} from './resolve-task-outline-user-message';

const AGENT_ID = 'a1111111-1111-4111-8111-111111111101';
const USER_ID = '95295e06-29eb-4046-898e-76a14f79c1bb';

describe('messageHasCatalogToken', () => {
  it('matches composer catalog tokens', () => {
    expect(
      messageHasCatalogToken(
        "I'd like :main/tabata/power and :finisher/tabata/vo2 using kettlebells",
      ),
    ).toBe(true);
  });

  it('returns false for plain prose', () => {
    expect(messageHasCatalogToken('Give me a hard leg day')).toBe(false);
  });
});

describe('filterHumanMessages', () => {
  it('excludes agent-authored rows and empty content', () => {
    const rows: OutlineMessageRow[] = [
      { content: 'Coach reply', user_id: AGENT_ID },
      { content: '  ', user_id: USER_ID },
      { content: 'User request', user_id: USER_ID },
    ];
    expect(filterHumanMessages(rows, new Set([AGENT_ID]))).toEqual([
      { content: 'User request', user_id: USER_ID },
    ]);
  });
});

describe('pickBestHumanOutlineMessage', () => {
  it('prefers catalog-token messages over longer plain text', () => {
    const rows: OutlineMessageRow[] = [
      {
        content: 'Yes I am comfortable with high intensity work for twenty second intervals.',
        user_id: USER_ID,
      },
      {
        content:
          "I'd like a workout with :main/tabata/power , :finisher/tabata/vo2 and :finisher/tabata/core",
        user_id: USER_ID,
      },
    ];
    const best = pickBestHumanOutlineMessage(rows);
    expect(best?.content).toContain(':main/tabata/power');
  });

  it('picks longest message when no catalog tokens', () => {
    const rows: OutlineMessageRow[] = [
      { content: 'Yes', user_id: USER_ID },
      { content: 'Build me a full body strength session with dumbbells only', user_id: USER_ID },
    ];
    expect(pickBestHumanOutlineMessage(rows)?.content).toContain('full body');
  });

  it('returns null for empty input', () => {
    expect(pickBestHumanOutlineMessage([])).toBeNull();
  });
});

describe('buildOutlineHistoryTexts', () => {
  it('returns other human lines newest-first, excluding primary', () => {
    const rows: OutlineMessageRow[] = [
      { content: 'First question', user_id: USER_ID },
      { content: 'Sounds good, make it.', user_id: USER_ID },
      { content: ':main/tabata/power primary', user_id: USER_ID },
    ];
    const history = buildOutlineHistoryTexts(rows, ':main/tabata/power primary');
    expect(history).toEqual(['Sounds good, make it.', 'First question']);
  });
});
