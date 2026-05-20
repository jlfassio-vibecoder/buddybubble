'use client';

type WorkoutBlockHeaderProps = {
  name: string;
  subtitle: string | null;
};

export function WorkoutBlockHeader({ name, subtitle }: WorkoutBlockHeaderProps) {
  return (
    <div className="space-y-0.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {name}
      </h4>
      {subtitle ? <p className="text-xs font-medium text-muted-foreground/80">{subtitle}</p> : null}
    </div>
  );
}
