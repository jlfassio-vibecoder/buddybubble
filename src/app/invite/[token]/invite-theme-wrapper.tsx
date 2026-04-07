'use client';

import type { ReactNode } from 'react';
import { ThemeScope } from '@/components/theme/ThemeScope';

type Props = {
  categoryType: string;
  children: ReactNode;
};

export function InviteThemeWrapper({ categoryType, children }: Props) {
  return <ThemeScope category={categoryType}>{children}</ThemeScope>;
}
