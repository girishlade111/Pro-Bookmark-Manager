import type { Metadata } from 'next';
import {
  Plus_Jakarta_Sans,
  Public_Sans,
  JetBrains_Mono,
} from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-jakarta',
});

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-public-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'Personal Visual Bookmark Manager',
  description:
    'Private, single-owner cloud bookmark manager with conservative full-URL duplicate detection, manual category priority, and PostgreSQL persistence.',
  openGraph: {
    title: 'Personal Visual Bookmark Manager',
    description:
      'Private, single-owner cloud bookmark manager with conservative full-URL duplicate detection, manual category priority, and PostgreSQL persistence.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${publicSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
