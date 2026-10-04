import './globals.css';

export const metadata = {
  title: 'News Summoner',
  description: 'ニュースをアバターが読み上げ、現実空間でも聞けるニュースサマリー',
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

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
