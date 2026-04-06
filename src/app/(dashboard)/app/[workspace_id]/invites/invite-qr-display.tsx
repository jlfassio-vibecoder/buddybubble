'use client';

import { QRCodeSVG } from 'qrcode.react';

export function InviteQrDisplay({ url }: { url: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-background p-4">
      <QRCodeSVG value={url} size={200} level="M" includeMargin />
      <p className="max-w-[240px] break-all text-center text-xs text-muted-foreground">
        Scan to open the invite link
      </p>
    </div>
  );
}
