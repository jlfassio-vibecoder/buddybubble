/**
 * Session length tiers for Density-Based AMRAP (5 / 15 / 20 minutes).
 */

import type { HiitSessionDurationTier } from '@/lib/workout-factory/types/ai-workout';

export function amrapDensityTierMinutes(tier: HiitSessionDurationTier): 5 | 15 | 20 {
  switch (tier) {
    case 'micro_dose':
      return 5;
    case 'standard_interval':
      return 15;
    case 'high_volume':
      return 20;
    default:
      return 15;
  }
}
