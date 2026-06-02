'use client';

import type { WrapperBaseProps } from '@/features/live-video/wrappers/types';
import { AmrapMechanics } from '@/features/live-video/wrappers/interval/AmrapMechanics';
import { BaseIntervalWrapper } from '@/features/live-video/wrappers/interval/BaseIntervalWrapper';

/** @deprecated Use BaseIntervalWrapper + AmrapMechanics via LiveSessionView */
export default function AmrapWrapper(props: WrapperBaseProps) {
  return <BaseIntervalWrapper {...props} renderMechanics={(ctx) => <AmrapMechanics {...ctx} />} />;
}
