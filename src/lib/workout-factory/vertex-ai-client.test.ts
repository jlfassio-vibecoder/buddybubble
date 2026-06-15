import { describe, expect, it } from 'vitest';
import { parseVertexChatCompletionResponse } from '@/lib/workout-factory/vertex-ai-client';

describe('parseVertexChatCompletionResponse', () => {
  it('extracts content, finish_reason, and usage from OpenAI-compat shape', () => {
    const result = parseVertexChatCompletionResponse({
      choices: [
        {
          message: { content: '{"blocks":[]}' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 1200,
        completion_tokens: 450,
        total_tokens: 1650,
      },
    });

    expect(result.content).toBe('{"blocks":[]}');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.promptTokens).toBe(1200);
    expect(result.usage.completionTokens).toBe(450);
    expect(result.usage.totalTokens).toBe(1650);
  });

  it('accepts length finish_reason for truncation detection', () => {
    const result = parseVertexChatCompletionResponse({
      choices: [{ message: { content: '{"blocks":[' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 100, completion_tokens: 8192, total_tokens: 8292 },
    });

    expect(result.finishReason).toBe('length');
    expect(result.usage.completionTokens).toBe(8192);
  });

  it('falls back to legacy content-only shape', () => {
    const result = parseVertexChatCompletionResponse({ content: 'hello' });
    expect(result.content).toBe('hello');
    expect(result.finishReason).toBeNull();
    expect(result.usage.completionTokens).toBeNull();
  });

  it('throws on unexpected shape', () => {
    expect(() => parseVertexChatCompletionResponse({ foo: 1 })).toThrow(
      'Unexpected API response format',
    );
  });
});
