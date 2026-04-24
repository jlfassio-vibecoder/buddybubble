import { cn } from '@/lib/utils';

export type PrivacyToggleProps = {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  pending?: boolean;
  onCheckedChange: (next: boolean) => void | Promise<void>;
  className?: string;
};

export function PrivacyToggle({
  id,
  title,
  description,
  checked,
  disabled = false,
  pending = false,
  onCheckedChange,
  className,
}: PrivacyToggleProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-muted/30 p-4', className)}>
      <label className="flex cursor-pointer items-start gap-3" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled || pending}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="mt-1 size-4 shrink-0 rounded border-input"
        />
        <span>
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          {description?.trim() ? (
            <span className="mt-0.5 block text-xs text-muted-foreground">{description.trim()}</span>
          ) : null}
        </span>
      </label>
    </div>
  );
}
