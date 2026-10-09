import './globals.css';
import type { Metadata, Viewport } from 'next';

const title = 'News Summoner｜アバターが読み上げるARニュース';
const description =
  'ニュースをアバターがやさしく読み上げ。IT・ビジネス・社会などの最新ニュースを音声で楽しみ、気になることはその場で質問できます。スマホのカメラを使ったAR体験にも対応。';

export const metadata: Metadata = {
  title: {
    default: title,
    template: '%s | News Summoner',
  },
  description,
  applicationName: 'News Summoner',
  keywords: [
    'ニュース',
    'ニュース読み上げ',
    '音声ニュース',
    'ニュース要約',
    'ニュースアプリ',
    'AR',
    '拡張現実',
    'アバター',
    'ITニュース',
    'ビジネスニュース',
  ],
  category: 'ニュース・メディア',
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    siteName: 'News Summoner',
    title,
    description,
  },
  twitter: {
    card: 'summary',
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#111827',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
