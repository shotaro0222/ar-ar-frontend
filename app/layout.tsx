import './globals.css';
import type { Metadata, Viewport } from 'next';
import Analytics from './components/Analytics';
import { GTM_ID, ORG_NAME, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from './lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}｜${SITE_TAGLINE}`, template: `%s｜${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ['ニュース要約', 'AIアバター', 'ニュース読み上げ', 'AR', 'XR', 'デジタルサイネージ', 'ニュースクイズ', 'ローカルニュース', 'アンケート'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: '/',
    siteName: SITE_NAME,
    title: `${SITE_NAME}｜${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: SITE_NAME }]
  },
  twitter: { card: 'summary_large_image', title: `${SITE_NAME}｜${SITE_TAGLINE}`, description: SITE_DESCRIPTION, images: ['/og.png'] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
  icons: { icon: [{ url: '/favicon.ico' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/apple-touch-icon.png' },
  manifest: '/manifest.webmanifest',
  verification: {
    google: process.env.NEXT_PUBLIC_GSC_VERIFICATION || undefined, // Search Console の確認コード
    other: process.env.NEXT_PUBLIC_BING_VERIFICATION ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_VERIFICATION } : undefined
  },
  category: 'news'
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0b0f19' };

// サイト全体の構造化データ（Google 検索での表示用）
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': `${SITE_URL}/#org`, name: ORG_NAME, url: SITE_URL, logo: `${SITE_URL}/icon-512.png` },
    { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: SITE_NAME, url: SITE_URL, inLanguage: 'ja', publisher: { '@id': `${SITE_URL}/#org` }, description: SITE_DESCRIPTION },
    { '@type': 'WebApplication', name: SITE_NAME, url: SITE_URL, applicationCategory: 'NewsApplication', operatingSystem: 'Web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' }, inLanguage: 'ja' }
  ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {GTM_ID && (
          <noscript>
            <iframe src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`} height="0" width="0" style={{ display: 'none', visibility: 'hidden' }} />
          </noscript>
        )}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
