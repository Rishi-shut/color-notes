import type { Metadata, Viewport } from 'next';
import './globals.css';

const title = 'Color Notes — your quiet corner';
const description = 'A fast, private notes space that works beautifully online and offline.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'https://color-notes-private.mriganksingh792005.chatgpt.site'),
  title,
  description,
  applicationName: 'Color Notes',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-192.svg', apple: '/icon-192.svg' },
  appleWebApp: { capable: true, title: 'Color Notes', statusBarStyle: 'default' },
  openGraph: { title, description, type: 'website', images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Color Notes — Your quiet corner, online or off.' }] },
  twitter: { card: 'summary_large_image', title, description, images: ['/og.png'] },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f7f3ea' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
