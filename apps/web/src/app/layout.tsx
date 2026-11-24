import type { Metadata } from 'next';
import '../styles/globals.css';
import { ThemeInitializer } from './theme-initializer';

export const metadata: Metadata = {
  title: 'ChatterBox — Connect · Chat · Share · Belong',
  description: 'Privacy-first social communication platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-canvas text-primary antialiased min-h-screen font-sans">
        <ThemeInitializer />
        {children}
      </body>
    </html>
  );
}
