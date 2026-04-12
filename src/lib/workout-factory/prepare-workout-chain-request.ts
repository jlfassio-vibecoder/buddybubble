/**
 * Shared validation + zone/equipment resolution for workout chain APIs
 * (generate and Step 1 prompt preview).
 */

import type {
  WorkoutPersona,
  WorkoutArchitectBlueprint,
  BlockOptions,
  HiitOptions,
  HiitCircuitStructure,
  HiitProtocolFormat,
  HiitPrimaryGoal,
  HiitSessionDurationTier,
  HiitWorkRestRatio,
  AmrapDensityOptions,
  TabataBalancedOptions,
  TabataBalancedPairingPattern,
} from '@/lib/workout-factory/types/ai-workout';
import {
  getZoneByIdServer,
  getAllEquipmentItemsServer,
} from '@/lib/workout-factory/server-equipment-stub';
import { amrapDensityTierMinutes } from '@/lib/workout-factory/amrap-density-tier';
import {
  TABATA_BALANCED_MAX_ROUNDS,
  TABATA_BALANCED_MIN_ROUNDS,
  tabataBalancedExerciseCount,
  tabataBalancedSessionMinutes,
} from '@/lib/workout-factory/tabata-balanced-duration';

export interface WorkoutChainZoneContext {
  zoneName: string;
  availableEquipment: string[];
  biomechanicalConstraints: string[];
}

export interface PreparedWorkoutChainRequest {
  persona: WorkoutPersona;
  blockOptions: BlockOptions;
  hiitOptions: HiitOptions | undefined;
  hiitMode: boolean;
  /** Normalized density AMRAP options when amrapDensityMode is true. */
  amrapDensityOptions: AmrapDensityOptions | undefined;
  /** Normalized balanced Tabata options when tabataBalancedMode is true. */
  tabataBalancedOptions: TabataBalancedOptions | undefined;
  zoneContext: WorkoutChainZoneContext | undefined;
  /** Equipment list used in Step 3 (Coach); mirrors generate-workout-chain. */
  availableEquipment: string[];
  providedArchitect: WorkoutArchitectBlueprint | undefined;
  /** When set, Step 1 uses this instead of buildWorkoutArchitectPrompt (only if no providedArchitect). */
  step1UserPromptOverride: string | undefined;
}

const defaultBlockOptions: BlockOptions = {
  includeWarmup: true,
  mainBlockCount: 1,
  includeFinisher: false,
  includeCooldown: false,
};

type IncomingBody = WorkoutPersona & {
  architectBlueprint?: WorkoutArchitectBlueprint;
  blockOptions?: BlockOptions;
  step1UserPromptOverride?: string;
  /** BuddyBubble: equipment labels (e.g. from fitness_profiles.equipment); used when no training zone. */
  availableEquipmentNames?: string[];
};

export type PrepareWorkoutChainResult =
  | { ok: true; data: PreparedWorkoutChainRequest }
  | { ok: false; response: Response };

/**
 * Validates persona + block options, resolves zone/equipment. No AI calls.
 */
export async function prepareWorkoutChainRequest(
  raw: unknown,
  shouldLog: boolean,
): Promise<PrepareWorkoutChainResult> {
  if (raw === null || typeof raw !== 'object') {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  const body = raw as IncomingBody;
  const {
    architectBlueprint: providedArchitect,
    blockOptions: requestBlockOptions,
    step1UserPromptOverride: rawOverride,
    availableEquipmentNames,
    ...persona
  } = body;

  const blockOptions: BlockOptions =
    requestBlockOptions && typeof requestBlockOptions === 'object'
      ? {
          includeWarmup: !!requestBlockOptions.includeWarmup,
          mainBlockCount:
            typeof requestBlockOptions.mainBlockCount === 'number' &&
            requestBlockOptions.mainBlockCount >= 1 &&
            requestBlockOptions.mainBlockCount <= 5
              ? (requestBlockOptions.mainBlockCount as 1 | 2 | 3 | 4 | 5)
              : 1,
          includeFinisher: !!requestBlockOptions.includeFinisher,
          includeCooldown: !!requestBlockOptions.includeCooldown,
        }
      : defaultBlockOptions;

  if (!persona.demographics || !persona.medical || !persona.goals) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'Invalid persona structure' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  if (
    typeof persona.weeklyTimeMinutes !== 'number' ||
    persona.weeklyTimeMinutes < 30 ||
    persona.weeklyTimeMinutes > 600
  ) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'weeklyTimeMinutes must be between 30 and 600' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }
  if (
    typeof persona.sessionsPerWeek !== 'number' ||
    persona.sessionsPerWeek < 1 ||
    persona.sessionsPerWeek > 7
  ) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'sessionsPerWeek must be between 1 and 7' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  const amrapDensityModeRaw = !!persona.amrapDensityMode;
  const hiitModeRaw = !!persona.hiitMode;
  const tabataBalancedModeRaw = !!persona.tabataBalancedMode;

  const metabolicModeCount =
    (amrapDensityModeRaw ? 1 : 0) + (hiitModeRaw ? 1 : 0) + (tabataBalancedModeRaw ? 1 : 0);
  if (metabolicModeCount > 1) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: 'At most one of hiitMode, amrapDensityMode, and tabataBalancedMode can be enabled',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }

  const amrapDensityMode = amrapDensityModeRaw;
  const tabataBalancedMode = tabataBalancedModeRaw;
  const hiitMode = !amrapDensityMode && !tabataBalancedMode && hiitModeRaw;

  const defaultHiitCircuitStructure: HiitCircuitStructure = {
    includeWarmup: true,
    circuit1: true,
    circuit2: false,
    circuit3: false,
    includeCooldown: true,
  };
  const defaultHiitOptions: HiitOptions = {
    protocolFormat: 'standard_ratio',
    workRestRatio: '1:1',
    circuitStructure: defaultHiitCircuitStructure,
    sessionDurationTier: 'standard_interval',
    primaryGoal: 'fat_oxidation',
  };

  const hiitProtocolFormats: readonly HiitProtocolFormat[] = [
    'standard_ratio',
    'tabata',
    'emom',
    'amrap',
    'ladder',
    'chipper',
  ];
  const hiitWorkRestRatios: readonly HiitWorkRestRatio[] = ['1:1', '2:1', '1:2', '1:3'];
  const hiitSessionDurationTiers: readonly HiitSessionDurationTier[] = [
    'micro_dose',
    'standard_interval',
    'high_volume',
  ];
  const hiitPrimaryGoals: readonly HiitPrimaryGoal[] = [
    'vo2_max',
    'lactate_tolerance',
    'explosive_power',
    'fat_oxidation',
  ];

  let hiitOptions: HiitOptions | undefined;
  if (hiitMode) {
    const rawHiit = persona.hiitOptions;
    if (!rawHiit || typeof rawHiit !== 'object') {
      hiitOptions = defaultHiitOptions;
    } else {
      const protocolFormat = rawHiit.protocolFormat ?? defaultHiitOptions.protocolFormat;
      if (!hiitProtocolFormats.includes(protocolFormat)) {
        return {
          ok: false,
          response: new Response(
            JSON.stringify({ error: 'hiitOptions.protocolFormat is invalid' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        };
      }
      const workRestRatio: HiitWorkRestRatio =
        rawHiit.workRestRatio ?? defaultHiitOptions.workRestRatio ?? '1:1';
      if (!hiitWorkRestRatios.includes(workRestRatio)) {
        return {
          ok: false,
          response: new Response(
            JSON.stringify({ error: 'hiitOptions.workRestRatio is invalid' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        };
      }
      const sessionDurationTier =
        rawHiit.sessionDurationTier ?? defaultHiitOptions.sessionDurationTier;
      if (!hiitSessionDurationTiers.includes(sessionDurationTier)) {
        return {
          ok: false,
          response: new Response(
            JSON.stringify({ error: 'hiitOptions.sessionDurationTier is invalid' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          ),
        };
      }
      const primaryGoal = rawHiit.primaryGoal ?? defaultHiitOptions.primaryGoal;
      if (!hiitPrimaryGoals.includes(primaryGoal)) {
        return {
          ok: false,
          response: new Response(JSON.stringify({ error: 'hiitOptions.primaryGoal is invalid' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
        };
      }
      const rawCircuit = rawHiit.circuitStructure;
      if (rawCircuit !== undefined && (!rawCircuit || typeof rawCircuit !== 'object')) {
        return {
          ok: false,
          response: new Response(
            JSON.stringify({ error: 'hiitOptions.circuitStructure must be an object' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          ),
        };
      }
      const mergedCircuitStructure: HiitCircuitStructure = {
        ...defaultHiitCircuitStructure,
        ...(rawCircuit ?? {}),
      };
      if (
        typeof mergedCircuitStructure.includeWarmup !== 'boolean' ||
        typeof mergedCircuitStructure.circuit1 !== 'boolean' ||
        typeof mergedCircuitStructure.circuit2 !== 'boolean' ||
        typeof mergedCircuitStructure.circuit3 !== 'boolean' ||
        typeof mergedCircuitStructure.includeCooldown !== 'boolean'
      ) {
        return {
          ok: false,
          response: new Response(
            JSON.stringify({
              error: 'hiitOptions.circuitStructure flags must be boolean values',
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          ),
        };
      }
      hiitOptions = {
        protocolFormat,
        workRestRatio,
        circuitStructure: mergedCircuitStructure,
        sessionDurationTier,
        primaryGoal,
      };
    }
  }

  let amrapDensityOptions: AmrapDensityOptions | undefined;
  if (amrapDensityMode) {
    const rawOpts = persona.amrapDensityOptions;
    if (!rawOpts || typeof rawOpts !== 'object') {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: 'amrapDensityOptions is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      };
    }
    if (rawOpts.protocolFormat !== 'AMRAP_DENSITY') {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ error: 'amrapDensityOptions.protocolFormat must be AMRAP_DENSITY' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      };
    }
    const wr = rawOpts.workRestRatio;
    if (wr !== 'continuous' && wr !== '0:0') {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            error: 'amrapDensityOptions.workRestRatio must be continuous or 0:0',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      };
    }
    const tier = rawOpts.sessionDurationTier;
    if (tier !== 'micro_dose' && tier !== 'standard_interval' && tier !== 'high_volume') {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ error: 'amrapDensityOptions.sessionDurationTier is invalid' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      };
    }
    amrapDensityOptions = {
      protocolFormat: 'AMRAP_DENSITY',
      workRestRatio: wr,
      sessionDurationTier: tier,
    };
  }

  let tabataBalancedOptions: TabataBalancedOptions | undefined;
  if (tabataBalancedMode) {
    const rawTabata = persona.tabataBalancedOptions;
    if (!rawTabata || typeof rawTabata !== 'object') {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: 'tabataBalancedOptions is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      };
    }
    const validPatterns: TabataBalancedPairingPattern[] = [
      'single',
      'antagonist_pair',
      'agonist_pair',
      'four_station',
      'eight_station',
    ];
    const pattern = rawTabata.pairingPattern;
    if (!validPatterns.includes(pattern)) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ error: 'tabataBalancedOptions.pairingPattern is invalid' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      };
    }
    const rc = rawTabata.roundCount;
    if (
      typeof rc !== 'number' ||
      rc !== Math.floor(rc) ||
      rc < TABATA_BALANCED_MIN_ROUNDS ||
      rc > TABATA_BALANCED_MAX_ROUNDS
    ) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            error: `tabataBalancedOptions.roundCount must be an integer between ${TABATA_BALANCED_MIN_ROUNDS} and ${TABATA_BALANCED_MAX_ROUNDS}`,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      };
    }
    const nEx = tabataBalancedExerciseCount(pattern);
    if (nEx > 1 && rc % nEx !== 0) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            error: `roundCount must be divisible by ${nEx} for pairing pattern ${pattern} so each exercise gets an equal number of work intervals`,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      };
    }
    tabataBalancedOptions = { pairingPattern: pattern, roundCount: rc };
  }

  if (typeof persona.sessionDurationMinutes !== 'number') {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'sessionDurationMinutes is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  if (amrapDensityMode && amrapDensityOptions) {
    const expectedMin = amrapDensityTierMinutes(amrapDensityOptions.sessionDurationTier);
    if (persona.sessionDurationMinutes !== expectedMin) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            error: `sessionDurationMinutes must be ${expectedMin} for the selected AMRAP density tier`,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      };
    }
  } else if (tabataBalancedMode && tabataBalancedOptions) {
    const expectedMin = tabataBalancedSessionMinutes(tabataBalancedOptions.roundCount);
    if (persona.sessionDurationMinutes !== expectedMin) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            error: `sessionDurationMinutes must be ${expectedMin} for the selected Tabata round count (main block only)`,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      };
    }
  } else if (hiitMode) {
    if (persona.sessionDurationMinutes < 4 || persona.sessionDurationMinutes > 30) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ error: 'sessionDurationMinutes must be between 4 and 30 in HIIT mode' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      };
    }
  } else if (persona.sessionDurationMinutes < 15 || persona.sessionDurationMinutes > 180) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'sessionDurationMinutes must be between 15 and 180' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }
  if (!persona.splitType || typeof persona.lifestyle !== 'string') {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'splitType and lifestyle are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  let zoneContext: WorkoutChainZoneContext | undefined;
  let availableEquipment: string[] = ['Bodyweight'];
  if (persona.zoneId) {
    try {
      const zone = await getZoneByIdServer(persona.zoneId);
      if (zone) {
        const equipmentItems = await getAllEquipmentItemsServer();
        const equipmentMap = new Map(equipmentItems.map((item) => [item.id, item.name]));
        const equipmentIdsToUse = persona.selectedEquipmentIds?.length
          ? persona.selectedEquipmentIds
          : zone.equipmentIds;
        availableEquipment = equipmentIdsToUse
          .map((id) => equipmentMap.get(id))
          .filter((name): name is string => name !== undefined);
        if (availableEquipment.length === 0) {
          availableEquipment = ['Bodyweight'];
        }
        zoneContext = {
          zoneName: zone.name,
          availableEquipment,
          biomechanicalConstraints: zone.biomechanicalConstraints || [],
        };
      }
    } catch (err) {
      if (shouldLog) console.error('[prepare-workout-chain-request] Zone fetch error:', err);
    }
  }

  if (
    availableEquipmentNames &&
    Array.isArray(availableEquipmentNames) &&
    availableEquipmentNames.length > 0
  ) {
    const names = availableEquipmentNames.map((s) => String(s).trim()).filter((s) => s.length > 0);
    if (names.length > 0) {
      availableEquipment = names;
    }
  }

  const step1UserPromptOverride =
    typeof rawOverride === 'string' && rawOverride.trim().length > 0
      ? rawOverride.trim()
      : undefined;

  const personaOut: WorkoutPersona = {
    ...(persona as WorkoutPersona),
    hiitMode,
    hiitOptions: hiitMode ? hiitOptions : undefined,
    amrapDensityMode,
    amrapDensityOptions: amrapDensityMode ? amrapDensityOptions : undefined,
    tabataBalancedMode,
    tabataBalancedOptions: tabataBalancedMode ? tabataBalancedOptions : undefined,
  };

  return {
    ok: true,
    data: {
      persona: personaOut,
      blockOptions,
      hiitOptions,
      hiitMode,
      amrapDensityOptions,
      tabataBalancedOptions,
      zoneContext,
      availableEquipment,
      providedArchitect,
      step1UserPromptOverride,
    },
  };
}
