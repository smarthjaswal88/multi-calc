import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import { Providers } from '@/providers';
import './globals.css';

/**
 * Two families, three roles.
 *
 * Archivo carries the chrome and the headings — a compact grotesque that runs tight at large
 * sizes. Every numeral sets in IBM Plex Mono with true tabular figures, which is the point of
 * the pairing: columns of money align on the decimal as the user types, and the typeface itself
 * signals which content is data and which is prose.
 */
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  display: 'swap',
});

const monoFigures = IBM_Plex_Mono({
  variable: '--font-mono-figures',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pricing Calculator',
  description: 'Build pricing documents with per-item discounts and tax, and totals you can trust.',
};

// LayoutProps is a Next-generated global, typed against the route so parallel slots and params
// come along. Preferred over a hand-written { children } in this version.
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${archivo.variable} ${monoFigures.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
