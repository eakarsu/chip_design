import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import ThemeRegistry from '@/app/ThemeRegistry';
import ErrorBoundary from '@/components/ErrorBoundary';
import LayoutWithSideNav from '@/components/LayoutWithSideNav';
import { AuthProvider } from '@/lib/auth/context';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://neuralchip.ai'),
  title: {
    default: 'NeuralChip - Professional Chip Design Platform & Academy',
    template: '%s | NeuralChip',
  },
  description: 'A professional chip-design platform and educational academy covering architecture, RTL, verification, physical design, signoff, manufacturing and post-silicon validation.',
  keywords: ['chip design', 'semiconductor education', 'RTL', 'verification', 'physical design', 'static timing analysis', 'ASIC', 'EDA', 'tapeout'],
  authors: [{ name: 'NeuralChip, Inc.' }],
  creator: 'NeuralChip, Inc.',
  publisher: 'NeuralChip, Inc.',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://neuralchip.ai',
    title: 'NeuralChip - Next-Generation AI Chip Architecture',
    description: 'Pioneering the next generation of AI chip architecture. Accelerating intelligence from edge to cloud.',
    siteName: 'NeuralChip',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'NeuralChip',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NeuralChip - Next-Generation AI Chip Architecture',
    description: 'Pioneering the next generation of AI chip architecture. Accelerating intelligence from edge to cloud.',
    images: ['/og-image.png'],
    creator: '@neuralchip',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} data-scroll-behavior="smooth">
      <head>
        {/* This icon font is global application chrome, not page-local content. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
        <link rel="canonical" href="https://neuralchip.ai" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'NeuralChip',
              url: 'https://neuralchip.ai',
              logo: 'https://neuralchip.ai/logo.png',
              description: 'Next-generation AI chip architecture company',
              sameAs: [
                'https://twitter.com/neuralchip',
                'https://linkedin.com/company/neuralchip',
                'https://github.com/neuralchip',
              ],
            }),
          }}
        />
      </head>
      <body>
        <ThemeRegistry>
          <AuthProvider>
            <ErrorBoundary>
              <LayoutWithSideNav>
                {children}
              </LayoutWithSideNav>
            </ErrorBoundary>
          </AuthProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
