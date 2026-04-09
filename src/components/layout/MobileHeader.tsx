'use client';

type Props = {
  title: string;
};

/** Title bar only; navigation opens from the bottom tab bar “Menu” item. */
export function MobileHeader({ title }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-center border-b border-border bg-background px-4 md:hidden">
      <h1 className="min-w-0 w-full truncate text-center text-sm font-semibold text-foreground">
        {title}
      </h1>
    </header>
  );
}
