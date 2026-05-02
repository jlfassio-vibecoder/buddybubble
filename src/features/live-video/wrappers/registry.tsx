import type { ComponentType } from 'react';

import AmrapMinimalWrapper from '@/features/live-video/wrappers/amrap/AmrapMinimalWrapper';
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
   * When false, LiveSessionView still mounts the wrapper for effects (overlays, etc.) but skips the
   * bordered inline card (e.g. `amrap_minimal`).
   */
  inlineUi?: boolean;
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
  amrap_minimal: {
    component: AmrapMinimalWrapper,
    hasVideoBackground: false,
    requiresAttach: true,
    label: 'AMRAP (minimal)',
    inlineUi: false,
  },
};

export function getIntervalWrapper(kind: IntervalWrapperKind): WrapperRegistryEntry | undefined {
  return REGISTRY[kind];
}

export function getAvailableWrapperKinds(): IntervalWrapperKind[] {
  return Object.keys(REGISTRY) as IntervalWrapperKind[];
}
