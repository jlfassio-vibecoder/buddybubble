'use client';

export interface MeLeaderToggleProps {
  mode: 'self' | 'leader';
  onModeChange: (mode: 'self' | 'leader') => void;
}

export default function MeLeaderToggle({ mode, onModeChange }: MeLeaderToggleProps) {
  return (
    <div className="flex rounded-lg border border-white/20 text-xs">
      <button
        type="button"
        className={`rounded-l-lg px-2 py-1 transition-colors ${
          mode === 'self' ? 'bg-white/20 text-white' : 'text-white/50'
        }`}
        onClick={() => onModeChange('self')}
        aria-pressed={mode === 'self'}
      >
        Me
      </button>
      <button
        type="button"
        className={`rounded-r-lg px-2 py-1 transition-colors ${
          mode === 'leader' ? 'bg-white/20 text-white' : 'text-white/50'
        }`}
        onClick={() => onModeChange('leader')}
        aria-pressed={mode === 'leader'}
      >
        Leader
      </button>
    </div>
  );
}
