import type { ComponentType } from 'react';

import AmrapWrapper from '@/features/live-video/wrappers/amrap/AmrapWrapper';
import { SimpleCountdownWrapper } from '@/features/live-video/wrappers/simple-countdown/SimpleCountdownWrapper';
import type { ShellChromeKind } from '@/features/live-video/theater/live-theater-layout.types';
import type { IntervalWrapperKind, WrapperBaseProps } from '@/features/live-video/wrappers/types';

export type WrapperRegistryEntry = {
  component: ComponentType<WrapperBaseProps>;
  hasVideoBackground: boolean;
  requiresAttach: boolean;
  label: string;
  /**
   * LiveSessionView-internal layout hint (workspace `deriveLiveTheaterLayoutPlan` is unchanged).
   * When `'theater_board_split'`, LiveSessionView uses the video|board resizable split for this wrapper.
   */
  preferredShell?: ShellChromeKind;
};

const REGISTRY: Partial<Record<IntervalWrapperKind, WrapperRegistryEntry>> = {
  simple_countdown: {
    component: SimpleCountdownWrapper,
    hasVideoBackground: false,
    requiresAttach: false,
    label: 'Block Countdown',
  },
  amrap: {
    component: AmrapWrapper,
    hasVideoBackground: false,
    requiresAttach: true,
    label: 'AMRAP',
  },
};

export function getIntervalWrapper(kind: IntervalWrapperKind): WrapperRegistryEntry | undefined {
  return REGISTRY[kind];
}

export function getAvailableWrapperKinds(): IntervalWrapperKind[] {
  return Object.keys(REGISTRY) as IntervalWrapperKind[];
}
