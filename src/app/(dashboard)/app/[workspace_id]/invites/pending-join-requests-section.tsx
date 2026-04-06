'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@utils/supabase/client';
import { bulkApproveJoinRequests } from '../waiting-room/actions';
import { Button } from '@/components/ui/button';
import { formatUserFacingError } from '@/lib/format-error';
import type { WaitingRoomRow } from '@/lib/waiting-room-rows';

type Props = {
  workspaceId: string;
  rows: WaitingRoomRow[];
  /** When false, omit outer section title (parent page already has a heading). */
  showHeading?: boolean;
};

export function PendingJoinRequestsSection({
  workspaceId,
  rows: initialRows,
  showHeading = true,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(initialRows);
    setSelected(new Set());
  }, [initialRows]);

  const pendingIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = pendingIds.length > 0 && pendingIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingIds));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refresh = () => {
    router.refresh();
  };

  const removeRow = (id: string) => {
    setRows((r) => r.filter((x) => x.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const approveOne = async (id: string) => {
    setError(null);
    setMessage(null);
    setBusyId(id);
    const supabase = createClient();
    const { error: rpcErr } = await supabase.rpc('approve_invitation_join_request', {
      p_join_request_id: id,
    });
    setBusyId(null);
    if (rpcErr) {
      setError(formatUserFacingError(rpcErr));
      return;
    }
    removeRow(id);
    setMessage('Request approved.');
    refresh();
  };

  const rejectOne = async (id: string) => {
    setError(null);
    setMessage(null);
    setBusyId(id);
    const supabase = createClient();
    const { error: rpcErr } = await supabase.rpc('reject_invitation_join_request', {
      p_join_request_id: id,
    });
    setBusyId(null);
    if (rpcErr) {
      setError(formatUserFacingError(rpcErr));
      return;
    }
    removeRow(id);
    setMessage('Request rejected.');
    refresh();
  };

  const onBulkApprove = async () => {
    const ids = pendingIds.filter((id) => selected.has(id));
    if (ids.length === 0) return;
    setError(null);
    setMessage(null);
    setBulkBusy(true);
    const result = await bulkApproveJoinRequests(workspaceId, ids);
    setBulkBusy(false);
    if (result.errors.length > 0) {
      setError(
        result.approved > 0
          ? `Approved ${result.approved}. Some failed: ${result.errors.join('; ')}`
          : result.errors.join('; '),
      );
    } else {
      setMessage(`Approved ${result.approved} request${result.approved === 1 ? '' : 's'}.`);
    }
    setSelected(new Set());
    refresh();
  };

  const onApproveAll = async () => {
    if (pendingIds.length === 0) return;
    setError(null);
    setMessage(null);
    setBulkBusy(true);
    const result = await bulkApproveJoinRequests(workspaceId, pendingIds);
    setBulkBusy(false);
    if (result.errors.length > 0) {
      setError(
        result.approved > 0
          ? `Approved ${result.approved}. Some failed: ${result.errors.join('; ')}`
          : result.errors.join('; '),
      );
    } else {
      setMessage(`Approved ${result.approved} request${result.approved === 1 ? '' : 's'}.`);
    }
    setSelected(new Set());
    refresh();
  };

  return (
    <section className="space-y-4">
      {showHeading ? (
        <div>
          <h2 className="text-base font-semibold text-foreground">Pending join requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve or reject people waiting to join this BuddyBubble.
          </p>
        </div>
      ) : null}

      {message ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No pending requests right now.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="default"
              disabled={bulkBusy}
              onClick={() => void onApproveAll()}
            >
              {bulkBusy ? 'Approving…' : `Approve all (${rows.length})`}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkBusy || selected.size === 0}
              onClick={() => void onBulkApprove()}
            >
              {bulkBusy ? 'Approving…' : `Approve selected (${selected.size})`}
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all on this page"
                      className="rounded border-input"
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">Requester</th>
                  <th className="px-3 py-2 font-medium">Invite</th>
                  <th className="px-3 py-2 font-medium">Requested</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const name = row.users?.full_name?.trim() || row.users?.email || row.user_id;
                  const email = row.users?.email;
                  const inv = row.invitations;
                  const invLabel =
                    inv?.label?.trim() ||
                    `${inv?.invite_type ?? 'link'} invite (${inv?.uses_count ?? 0}/${inv?.max_uses ?? '—'})`;
                  const busy = busyId === row.id;
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 align-middle">
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggleOne(row.id)}
                          aria-label={`Select ${name}`}
                          className="rounded border-input"
                        />
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="font-medium text-foreground">{name}</div>
                        {email && name !== email ? (
                          <div className="text-xs text-muted-foreground">{email}</div>
                        ) : null}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2 align-middle text-muted-foreground">
                        {invLabel}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-middle text-muted-foreground">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right align-middle">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            disabled={busy || bulkBusy}
                            onClick={() => void approveOne(row.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy || bulkBusy}
                            onClick={() => void rejectOne(row.id)}
                          >
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
