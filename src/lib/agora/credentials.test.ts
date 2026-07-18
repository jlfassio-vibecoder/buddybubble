import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAgoraCredentials, resolveAgoraWebhookSecret } from './credentials';

const ENV_KEYS = [
  'AGORA_ACTIVE_ENV',
  'AGORA_APP_ID',
  'AGORA_APP_ID_PRIMARY',
  'AGORA_APP_ID_SECONDARY',
  'AGORA_APP_CERTIFICATE',
  'AGORA_APP_CERTIFICATE_PRIMARY',
  'AGORA_APP_CERTIFICATE_SECONDARY',
  'AGORA_WEBHOOK_SECRET',
  'AGORA_WEBHOOK_SECRET_PRIMARY',
  'AGORA_WEBHOOK_SECRET_SECONDARY',
] as const;

const originalEnv = new Map<string, string | undefined>();

describe('resolveAgoraCredentials', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const original = originalEnv.get(key);
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
    originalEnv.clear();
  });

  it('uses trimmed primary credentials by default', () => {
    process.env.AGORA_APP_ID = ' primary-app ';
    process.env.AGORA_APP_CERTIFICATE = ' primary-cert ';

    expect(resolveAgoraCredentials()).toEqual({
      appId: 'primary-app',
      appCertificate: 'primary-cert',
    });
  });

  it('uses suffixed primary credentials when base values are blank', () => {
    process.env.AGORA_APP_ID = '   ';
    process.env.AGORA_APP_CERTIFICATE = '';
    process.env.AGORA_APP_ID_PRIMARY = 'primary-app';
    process.env.AGORA_APP_CERTIFICATE_PRIMARY = 'primary-cert';

    expect(resolveAgoraCredentials()).toEqual({
      appId: 'primary-app',
      appCertificate: 'primary-cert',
    });
  });

  it('selects secondary credentials case-insensitively as an atomic unit', () => {
    process.env.AGORA_ACTIVE_ENV = ' secondary ';
    process.env.AGORA_APP_ID = 'primary-app';
    process.env.AGORA_APP_CERTIFICATE = 'primary-cert';
    process.env.AGORA_APP_ID_SECONDARY = ' secondary-app ';
    process.env.AGORA_APP_CERTIFICATE_SECONDARY = ' secondary-cert ';

    expect(resolveAgoraCredentials()).toEqual({
      appId: 'secondary-app',
      appCertificate: 'secondary-cert',
    });
  });

  it('returns unconfigured when secondary unit is incomplete (no per-field primary fallback)', () => {
    process.env.AGORA_ACTIVE_ENV = 'SECONDARY';
    process.env.AGORA_APP_ID = 'primary-app';
    process.env.AGORA_APP_CERTIFICATE_PRIMARY = 'primary-cert';
    process.env.AGORA_APP_ID_SECONDARY = 'secondary-app';
    process.env.AGORA_APP_CERTIFICATE_SECONDARY = '  ';

    expect(resolveAgoraCredentials()).toEqual({
      appId: undefined,
      appCertificate: undefined,
    });
  });
});

describe('resolveAgoraWebhookSecret', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const original = originalEnv.get(key);
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
    originalEnv.clear();
  });

  it('uses primary webhook secret by default', () => {
    process.env.AGORA_WEBHOOK_SECRET = ' primary-secret ';
    expect(resolveAgoraWebhookSecret()).toBe('primary-secret');
  });

  it('requires secondary webhook secret with no primary fallback', () => {
    process.env.AGORA_ACTIVE_ENV = 'SECONDARY';
    process.env.AGORA_WEBHOOK_SECRET = 'primary-secret';
    process.env.AGORA_WEBHOOK_SECRET_SECONDARY = '  ';
    expect(resolveAgoraWebhookSecret()).toBeUndefined();
  });

  it('returns trimmed secondary webhook secret when configured', () => {
    process.env.AGORA_ACTIVE_ENV = 'secondary';
    process.env.AGORA_WEBHOOK_SECRET_SECONDARY = ' secondary-secret ';
    expect(resolveAgoraWebhookSecret()).toBe('secondary-secret');
  });
});
