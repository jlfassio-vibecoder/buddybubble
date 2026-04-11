'use client';

import { Toaster } from 'sonner';

/** Global toast host (see `toast` from `sonner`). */
export function AppToaster() {
  return <Toaster position="bottom-center" richColors closeButton />;
}
