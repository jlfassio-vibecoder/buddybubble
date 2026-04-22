/**
 * Visual container for the hero body. Persists across phases so only inner content
 * swaps. The radial purple glow is rendered by the parent `StorefrontHero` wrap
 * behind this shell.
 *
 * @param {{ children: import('react').ReactNode }} props
 */
export default function HeroShell({ children }) {
  return (
    <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center justify-center px-4 pb-10 pt-4 text-center text-white sm:px-6 sm:pb-14 sm:pt-6">
      {children}
    </div>
  );
}
