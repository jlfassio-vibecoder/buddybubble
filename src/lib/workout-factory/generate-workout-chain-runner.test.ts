import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrepare = vi.hoisted(() => vi.fn());
const mockGetCreds = vi.hoisted(() => vi.fn());
const mockRunExtract = vi.hoisted(() => vi.fn());

vi.mock('@/lib/workout-factory/prepare-workout-chain-request', () => ({
  prepareWorkoutChainRequest: mockPrepare,
}));
vi.mock('@/lib/workout-factory/vertex-ai-client', () => ({
  getVertexAICredentials: mockGetCreds,
}));
vi.mock('@/lib/workout-factory/generate-workout-kanban-extract-runner', () => ({
  runExtractAndEnrichChain: mockRunExtract,
}));

import { runGenerateWorkoutChain } from '@/lib/workout-factory/generate-workout-chain-runner';

describe('runGenerateWorkoutChain', () => {
  beforeEach(() => {
    mockPrepare.mockReset();
    mockGetCreds.mockReset();
    mockRunExtract.mockReset();
  });

  it('always delegates to runExtractAndEnrichChain when prepare and credentials succeed', async () => {
    const chainRequest = { persona: { splitType: 'full_body' } };
    mockPrepare.mockResolvedValue({ ok: true, data: chainRequest });
    const creds = { projectId: 'p', region: 'r', accessToken: 't' };
    mockGetCreds.mockResolvedValue(creds);
    const success = { ok: true, data: { workoutSet: {}, chain_metadata: {} } };
    mockRunExtract.mockResolvedValue(success);

    const out = await runGenerateWorkoutChain({ foo: 'bar' }, false);

    expect(mockPrepare).toHaveBeenCalledWith({ foo: 'bar' }, false);
    expect(mockGetCreds).toHaveBeenCalled();
    expect(mockRunExtract).toHaveBeenCalledWith(chainRequest, creds, false);
    expect(out).toBe(success);
  });

  it('returns the prepare error response when validation fails', async () => {
    const errResponse = new Response(JSON.stringify({ error: 'invalid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
    mockPrepare.mockResolvedValue({ ok: false, response: errResponse });

    const out = await runGenerateWorkoutChain({}, false);

    expect(out).toEqual({ ok: false, response: errResponse });
    expect(mockGetCreds).not.toHaveBeenCalled();
    expect(mockRunExtract).not.toHaveBeenCalled();
  });

  it('returns creds error when Vertex is not configured', async () => {
    mockPrepare.mockResolvedValue({ ok: true, data: {} });
    const credsErr = new Response('unauthorized', { status: 500 });
    mockGetCreds.mockResolvedValue({ error: credsErr });

    const out = await runGenerateWorkoutChain({}, false);

    expect(out).toEqual({ ok: false, response: credsErr });
    expect(mockRunExtract).not.toHaveBeenCalled();
  });
});
