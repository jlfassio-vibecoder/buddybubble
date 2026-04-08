import type { Metadata } from 'next';
import './globals.css';
import { Geist } from 'next/font/google';
import { cn } from '@/lib/utils';
import { AppThemeProvider } from '@/components/theme/app-theme-provider';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'BuddyBubble',
  description: 'BuddyBubble — chat and cards in your BuddyBubbles and Bubbles.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn('font-sans', geist.variable)} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased text-foreground">
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
