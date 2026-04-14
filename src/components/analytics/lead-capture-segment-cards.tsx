'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { LeadAcquisitionSegment, LeadCaptureDisplayRow } from '@/lib/lead-capture-analytics';

type Props = {
  inPersonCount: number;
  onlineCount: number;
  inPersonRows: LeadCaptureDisplayRow[];
  onlineRows: LeadCaptureDisplayRow[];
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  } catch {
    return iso;
  }
}

export function LeadCaptureSegmentCards({
  inPersonCount,
  onlineCount,
  inPersonRows,
  onlineRows,
}: Props) {
  const [open, setOpen] = useState(false);
  const [segment, setSegment] = useState<LeadAcquisitionSegment>('in_person');

  function openSegment(s: LeadAcquisitionSegment) {
    setSegment(s);
    setOpen(true);
  }

  const rows = segment === 'in_person' ? inPersonRows : onlineRows;
  const title =
    segment === 'in_person' ? 'In-person leads (link / QR)' : 'Online leads (email / SMS / other)';

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => openSegment('in_person')}
          className={cn(
            'text-left transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Card className="h-full cursor-pointer border-2 border-transparent hover:border-primary/25">
            <CardContent className="pt-6">
              <p className="text-3xl font-bold tabular-nums">{inPersonCount}</p>
              <p className="mt-1 text-sm font-medium text-foreground">In-person leads</p>
              <p className="mt-2 text-xs leading-snug text-muted-foreground">
                Invite opened from a link or QR while you and your guest are typically together.
                Click for names and dates.
              </p>
            </CardContent>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => openSegment('online')}
          className={cn(
            'text-left transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Card className="h-full cursor-pointer border-2 border-transparent hover:border-primary/25">
            <CardContent className="pt-6">
              <p className="text-3xl font-bold tabular-nums">{onlineCount}</p>
              <p className="mt-1 text-sm font-medium text-foreground">Online leads</p>
              <p className="mt-2 text-xs leading-snug text-muted-foreground">
                Email or SMS invites and legacy rows. Click for details.
              </p>
            </CardContent>
          </Card>
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden gap-0 p-0">
          <DialogHeader className="border-b border-border px-6 py-4 text-left">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Newest first (last 30 days). Name and email appear after the visitor signs in and
              completes their profile when applicable.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(60vh,520px)] overflow-auto px-2 pb-4 sm:px-4">
            {rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No leads in this segment for the selected period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Email</th>
                      <th className="py-2 pr-3">First seen</th>
                      <th className="py-2 pr-3">Last seen</th>
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3">UTM</th>
                      <th className="py-2 pr-3">Linked</th>
                      <th className="py-2">Invite</th>
                    </tr>
                  </thead>
                  <tbody className="align-top">
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/80">
                        <td className="py-2 pr-3 text-foreground">
                          {r.displayName?.trim() || (r.hasLinkedUser ? '—' : 'Not signed up yet')}
                        </td>
                        <td className="max-w-[140px] truncate py-2 pr-3 font-mono text-xs text-muted-foreground">
                          {r.email ?? '—'}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-muted-foreground">
                          {formatWhen(r.firstSeenAt)}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-muted-foreground">
                          {formatWhen(r.lastSeenAt)}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{r.source}</td>
                        <td className="max-w-[160px] truncate py-2 pr-3 font-mono text-[11px] text-muted-foreground">
                          {r.utmSummary}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {r.hasLinkedUser ? 'Yes' : 'No'}
                        </td>
                        <td className="py-2 font-mono text-[11px] text-muted-foreground">
                          {r.inviteSuffix ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
