import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrepare = vi.hoisted(() => vi.fn());
const mockGetCreds = vi.hoisted(() => vi.fn());
const mockRunExtract = vi.hoisted(() => vi.fn());
const mockRunOutlineFill = vi.hoisted(() => vi.fn());

vi.mock('@/lib/workout-factory/prepare-workout-chain-request', () => ({
  prepareWorkoutChainRequest: mockPrepare,
}));
vi.mock('@/lib/workout-factory/vertex-ai-client', () => ({
  getVertexAICredentials: mockGetCreds,
}));
vi.mock('@/lib/workout-factory/generate-workout-kanban-extract-runner', () => ({
  runExtractAndEnrichChain: mockRunExtract,
}));
vi.mock('@/lib/workout-factory/generate-workout-outline-fill-runner', () => ({
  runGenerateWorkoutOutlineFill: mockRunOutlineFill,
}));

import { runGenerateWorkoutChain } from '@/lib/workout-factory/generate-workout-chain-runner';

const validOutline = [
  {
    name: 'Main EMOM',
    block_format: 'emom',
    format_params: { interval_seconds: 60, total_minutes: 16, is_alternating: true },
    exercises: [{ name: 'Kettlebell Swing' }, { name: 'Goblet Squat' }],
  },
];

describe('runGenerateWorkoutChain', () => {
  beforeEach(() => {
    mockPrepare.mockReset();
    mockGetCreds.mockReset();
    mockRunExtract.mockReset();
    mockRunOutlineFill.mockReset();
  });

  it('delegates to runGenerateWorkoutOutlineFill when coachWorkoutOutline preflight succeeds', async () => {
    const chainRequest = { persona: { splitType: 'full_body' }, coachWorkoutOutline: validOutline };
    mockPrepare.mockResolvedValue({ ok: true, data: chainRequest });
    const creds = { projectId: 'p', region: 'r', accessToken: 't' };
    mockGetCreds.mockResolvedValue(creds);
    const success = {
      ok: true,
      data: { workoutSet: {}, chain_metadata: { pipeline: 'parametric_outline_fill' } },
    };
    mockRunOutlineFill.mockResolvedValue(success);

    const out = await runGenerateWorkoutChain({ foo: 'bar' }, false);

    expect(mockPrepare).toHaveBeenCalledWith({ foo: 'bar' }, false);
    expect(mockGetCreds).toHaveBeenCalled();
    expect(mockRunOutlineFill).toHaveBeenCalledWith(chainRequest, creds, false, {
      createdByUserId: undefined,
      requestId: undefined,
    });
    expect(mockRunExtract).not.toHaveBeenCalled();
    expect(out).toBe(success);
  });

  it('forwards createdByUserId to runGenerateWorkoutOutlineFill', async () => {
    const chainRequest = { persona: { splitType: 'full_body' }, coachWorkoutOutline: validOutline };
    mockPrepare.mockResolvedValue({ ok: true, data: chainRequest });
    const creds = { projectId: 'p', region: 'r', accessToken: 't' };
    mockGetCreds.mockResolvedValue(creds);
    const success = { ok: true, data: { workoutSet: {}, chain_metadata: {} } };
    mockRunOutlineFill.mockResolvedValue(success);

    await runGenerateWorkoutChain({ foo: 'bar' }, false, {
      createdByUserId: '9b2d0c4e-0e3e-4c5a-9a1a-0e3e4c5a9a1a',
    });

    expect(mockRunOutlineFill).toHaveBeenCalledWith(chainRequest, creds, false, {
      createdByUserId: '9b2d0c4e-0e3e-4c5a-9a1a-0e3e4c5a9a1a',
      requestId: undefined,
    });
  });

  it('returns OUTLINE_REQUIRED_FOR_FACTORY when coachWorkoutOutline is absent', async () => {
    const chainRequest = { persona: { splitType: 'full_body' } };
    mockPrepare.mockResolvedValue({ ok: true, data: chainRequest });
    const creds = { projectId: 'p', region: 'r', accessToken: 't' };
    mockGetCreds.mockResolvedValue(creds);

    const out = await runGenerateWorkoutChain({}, false);

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.response.status).toBe(400);
    const body = (await out.response.json()) as { error?: string };
    expect(body.error).toBe('OUTLINE_REQUIRED_FOR_FACTORY');
    expect(mockRunExtract).not.toHaveBeenCalled();
    expect(mockRunOutlineFill).not.toHaveBeenCalled();
  });

  it('returns OUTLINE_REQUIRED_FOR_FACTORY when outline preflight drops all blocks', async () => {
    const chainRequest = {
      persona: { splitType: 'full_body' },
      coachWorkoutOutline: [{ name: 'Bad', block_format: 'not_a_format' }],
    };
    mockPrepare.mockResolvedValue({ ok: true, data: chainRequest });
    const creds = { projectId: 'p', region: 'r', accessToken: 't' };
    mockGetCreds.mockResolvedValue(creds);

    const out = await runGenerateWorkoutChain({}, false);

    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.response.status).toBe(400);
    const body = (await out.response.json()) as { error?: string };
    expect(body.error).toBe('OUTLINE_REQUIRED_FOR_FACTORY');
    expect(mockRunExtract).not.toHaveBeenCalled();
    expect(mockRunOutlineFill).not.toHaveBeenCalled();
  });

  it('returns the prepare error response when validation fails', async () => {
    const errResponse = new Response(JSON.stringify({ error: 'invalid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
    mockPrepare.mockResolvedValue({ ok: false, response: errResponse });

    const out = await runGenerateWorkoutChain({}, false);

    expect(out).toEqual({ ok: false, response: errResponse, telemetry: null });
    expect(mockGetCreds).not.toHaveBeenCalled();
    expect(mockRunExtract).not.toHaveBeenCalled();
    expect(mockRunOutlineFill).not.toHaveBeenCalled();
  });

  it('returns creds error when Vertex is not configured', async () => {
    mockPrepare.mockResolvedValue({ ok: true, data: {} });
    const credsErr = new Response('unauthorized', { status: 500 });
    mockGetCreds.mockResolvedValue({ error: credsErr });

    const out = await runGenerateWorkoutChain({}, false);

    expect(out).toEqual({ ok: false, response: credsErr, telemetry: null });
    expect(mockRunExtract).not.toHaveBeenCalled();
    expect(mockRunOutlineFill).not.toHaveBeenCalled();
  });
});
