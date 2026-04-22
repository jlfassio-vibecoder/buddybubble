/**
 * Top nav strip. Brand left, ghost "Join community" right.
 * Static layout only — no state-driven styling here.
 *
 * @param {{ workspaceName?: string; joinHref: string; accentColor?: string }} props
 */
export default function HeroNav({ workspaceName, joinHref, accentColor }) {
  return (
    <nav className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
      <span
        className="truncate text-[14px] font-medium tracking-tight text-white"
        style={{ letterSpacing: '-0.01em' }}
      >
        {workspaceName || 'BuddyBubble'}
      </span>
      <a
        href={joinHref}
        className="inline-flex items-center justify-center rounded-lg border px-4 py-2 text-[13px] font-medium text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
          borderColor: accentColor ? `${accentColor}66` : 'rgba(255, 255, 255, 0.12)',
          borderWidth: '0.5px',
          outlineColor: '#7F77DD',
        }}
      >
        Join community
      </a>
    </nav>
  );
}
