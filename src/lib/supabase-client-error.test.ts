import { describe, expect, it } from 'vitest';
import { isSupabaseBenignRequestAbort } from '@/lib/supabase-client-error';

describe('isSupabaseBenignRequestAbort', () => {
  it('treats Web Lock steal AbortError as benign even without AbortError: prefix', () => {
    expect(
      isSupabaseBenignRequestAbort(
        new DOMException("Lock broken by another request with the 'steal' option.", 'AbortError'),
      ),
    ).toBe(true);
  });

  it('treats typed acquire-timeout steal errors as benign', () => {
    const err = Object.assign(new Error('Lock "x" was released because another request stole it'), {
      isAcquireTimeout: true,
    });
    expect(isSupabaseBenignRequestAbort(err)).toBe(true);
  });
});
