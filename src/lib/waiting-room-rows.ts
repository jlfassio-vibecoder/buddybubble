/** Shared shape for admin waiting-room / invites “pending approvals” UI. */
export type WaitingRoomRow = {
  id: string;
  created_at: string;
  invitation_id: string;
  user_id: string;
  users: { full_name: string | null; email: string | null } | null;
  invitations: {
    label: string | null;
    invite_type: string;
    max_uses: number;
    uses_count: number;
  } | null;
};

export function normalizeWaitingRoomRows(data: unknown): WaitingRoomRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((raw) => {
    const r = raw as Record<string, unknown>;
    const u = r.users;
    const userObj =
      u && typeof u === 'object' && !Array.isArray(u)
        ? (u as { full_name?: string | null; email?: string | null })
        : Array.isArray(u) && u[0] && typeof u[0] === 'object'
          ? (u[0] as { full_name?: string | null; email?: string | null })
          : null;
    const invRaw = r.invitations;
    const invObj =
      invRaw && typeof invRaw === 'object' && !Array.isArray(invRaw)
        ? (invRaw as {
            label?: string | null;
            invite_type?: string;
            max_uses?: number;
            uses_count?: number;
          })
        : Array.isArray(invRaw) && invRaw[0] && typeof invRaw[0] === 'object'
          ? (invRaw[0] as {
              label?: string | null;
              invite_type?: string;
              max_uses?: number;
              uses_count?: number;
            })
          : null;
    return {
      id: String(r.id),
      created_at: String(r.created_at),
      invitation_id: String(r.invitation_id),
      user_id: String(r.user_id),
      users: userObj
        ? { full_name: userObj.full_name ?? null, email: userObj.email ?? null }
        : null,
      invitations: invObj
        ? {
            label: invObj.label ?? null,
            invite_type: String(invObj.invite_type ?? 'link'),
            max_uses: Number(invObj.max_uses ?? 1),
            uses_count: Number(invObj.uses_count ?? 0),
          }
        : null,
    };
  });
}
