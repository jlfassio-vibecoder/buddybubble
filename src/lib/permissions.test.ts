import { describe, it, expect } from 'vitest';
import {
  atLeast,
  canWriteWorkspace,
  canManageWorkspace,
  canDeleteWorkspace,
  canPromoteToOwner,
  canWriteBubble,
  canViewBubble,
  resolvePermissions,
} from './permissions';
import type { MemberRole, BubbleMemberRole } from '@/types/database';

// ---------------------------------------------------------------------------
// atLeast
// ---------------------------------------------------------------------------
describe('atLeast', () => {
  it('owner >= all roles', () => {
    expect(atLeast('owner', 'owner')).toBe(true);
    expect(atLeast('owner', 'admin')).toBe(true);
    expect(atLeast('owner', 'member')).toBe(true);
    expect(atLeast('owner', 'guest')).toBe(true);
  });

  it('admin >= admin/member/guest but not owner', () => {
    expect(atLeast('admin', 'owner')).toBe(false);
    expect(atLeast('admin', 'admin')).toBe(true);
    expect(atLeast('admin', 'member')).toBe(true);
    expect(atLeast('admin', 'guest')).toBe(true);
  });

  it('member >= member/guest but not admin/owner', () => {
    expect(atLeast('member', 'owner')).toBe(false);
    expect(atLeast('member', 'admin')).toBe(false);
    expect(atLeast('member', 'member')).toBe(true);
    expect(atLeast('member', 'guest')).toBe(true);
  });

  it('guest is the lowest rank', () => {
    expect(atLeast('guest', 'owner')).toBe(false);
    expect(atLeast('guest', 'admin')).toBe(false);
    expect(atLeast('guest', 'member')).toBe(false);
    expect(atLeast('guest', 'guest')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Workspace-level helpers
// ---------------------------------------------------------------------------
describe('canWriteWorkspace', () => {
  it('true for owner, admin, member', () => {
    expect(canWriteWorkspace('owner')).toBe(true);
    expect(canWriteWorkspace('admin')).toBe(true);
    expect(canWriteWorkspace('member')).toBe(true);
  });

  it('false for guest', () => {
    expect(canWriteWorkspace('guest')).toBe(false);
  });
});

describe('canManageWorkspace', () => {
  it('true for owner and admin', () => {
    expect(canManageWorkspace('owner')).toBe(true);
    expect(canManageWorkspace('admin')).toBe(true);
  });

  it('false for member and guest', () => {
    expect(canManageWorkspace('member')).toBe(false);
    expect(canManageWorkspace('guest')).toBe(false);
  });
});

describe('canDeleteWorkspace', () => {
  it('true only for owner', () => {
    expect(canDeleteWorkspace('owner')).toBe(true);
    expect(canDeleteWorkspace('admin')).toBe(false);
    expect(canDeleteWorkspace('member')).toBe(false);
    expect(canDeleteWorkspace('guest')).toBe(false);
  });
});

describe('canPromoteToOwner', () => {
  it('true only for owner', () => {
    expect(canPromoteToOwner('owner')).toBe(true);
    expect(canPromoteToOwner('admin')).toBe(false);
    expect(canPromoteToOwner('member')).toBe(false);
    expect(canPromoteToOwner('guest')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canWriteBubble
// ---------------------------------------------------------------------------
describe('canWriteBubble', () => {
  describe('public bubble (isPrivate=false)', () => {
    it('owner/admin can always write', () => {
      expect(canWriteBubble('owner', null, false)).toBe(true);
      expect(canWriteBubble('admin', null, false)).toBe(true);
    });

    it('member can write to public bubble', () => {
      expect(canWriteBubble('member', null, false)).toBe(true);
    });

    it('guest cannot write without explicit bubble membership', () => {
      expect(canWriteBubble('guest', null, false)).toBe(false);
    });

    it('guest with editor role can write', () => {
      expect(canWriteBubble('guest', 'editor', false)).toBe(true);
    });

    it('guest with viewer role cannot write', () => {
      expect(canWriteBubble('guest', 'viewer', false)).toBe(false);
    });
  });

  describe('private bubble (isPrivate=true)', () => {
    it('owner/admin can always write', () => {
      expect(canWriteBubble('owner', null, true)).toBe(true);
      expect(canWriteBubble('admin', null, true)).toBe(true);
    });

    it('member without explicit membership cannot write', () => {
      expect(canWriteBubble('member', null, true)).toBe(false);
    });

    it('member with editor role can write', () => {
      expect(canWriteBubble('member', 'editor', true)).toBe(true);
    });

    it('member with viewer role cannot write', () => {
      expect(canWriteBubble('member', 'viewer', true)).toBe(false);
    });

    it('guest with editor role can write', () => {
      expect(canWriteBubble('guest', 'editor', true)).toBe(true);
    });

    it('guest with viewer role cannot write', () => {
      expect(canWriteBubble('guest', 'viewer', true)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// canViewBubble
// ---------------------------------------------------------------------------
describe('canViewBubble', () => {
  describe('public bubble', () => {
    it('owner/admin can always view', () => {
      expect(canViewBubble('owner', null, false)).toBe(true);
      expect(canViewBubble('admin', null, false)).toBe(true);
    });

    it('member can view public bubble', () => {
      expect(canViewBubble('member', null, false)).toBe(true);
    });

    it('guest without bubble membership cannot view', () => {
      expect(canViewBubble('guest', null, false)).toBe(false);
    });

    it('guest with any bubble role can view', () => {
      expect(canViewBubble('guest', 'viewer', false)).toBe(true);
      expect(canViewBubble('guest', 'editor', false)).toBe(true);
    });
  });

  describe('private bubble', () => {
    it('owner/admin can always view', () => {
      expect(canViewBubble('owner', null, true)).toBe(true);
      expect(canViewBubble('admin', null, true)).toBe(true);
    });

    it('member without membership cannot view', () => {
      expect(canViewBubble('member', null, true)).toBe(false);
    });

    it('member with any bubble role can view', () => {
      expect(canViewBubble('member', 'viewer', true)).toBe(true);
      expect(canViewBubble('member', 'editor', true)).toBe(true);
    });

    it('guest with viewer role can view', () => {
      expect(canViewBubble('guest', 'viewer', true)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// resolvePermissions — spot-check the bundle
// ---------------------------------------------------------------------------
describe('resolvePermissions', () => {
  it('owner on a private bubble with no explicit membership', () => {
    const flags = resolvePermissions('owner', null, true);
    expect(flags.canWrite).toBe(true);
    expect(flags.canView).toBe(true);
    expect(flags.isAdmin).toBe(true);
    expect(flags.isOwner).toBe(true);
    expect(flags.canManageMembers).toBe(true);
    expect(flags.canManageBubble).toBe(true);
  });

  it('guest with viewer bubble role on a private bubble', () => {
    const flags = resolvePermissions('guest', 'viewer', true);
    expect(flags.canWrite).toBe(false);
    expect(flags.canView).toBe(true);
    expect(flags.isAdmin).toBe(false);
    expect(flags.isOwner).toBe(false);
    expect(flags.canManageMembers).toBe(false);
    expect(flags.canManageBubble).toBe(false);
  });

  it('member on a public bubble (default args)', () => {
    const flags = resolvePermissions('member');
    expect(flags.canWrite).toBe(true);
    expect(flags.canView).toBe(true);
    expect(flags.isAdmin).toBe(false);
    expect(flags.isOwner).toBe(false);
  });
});
