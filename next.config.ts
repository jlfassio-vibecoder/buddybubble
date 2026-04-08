import type { NextConfig } from 'next';

function marketingFrameAncestorsHeader(): { key: string; value: string } | null {
  const raw = process.env.MARKETING_FRAME_ANCESTORS?.trim();
  if (!raw) return null;
  const origins = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins.length === 0) return null;
  return {
    key: 'Content-Security-Policy',
    value: `frame-ancestors 'self' ${origins.join(' ')}`,
  };
}

const frameAncestors = marketingFrameAncestorsHeader();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    if (!frameAncestors) return [];
    return [
      { source: '/demo', headers: [frameAncestors] },
      { source: '/app/:path*', headers: [frameAncestors] },
    ];
  },
};

export default nextConfig;
