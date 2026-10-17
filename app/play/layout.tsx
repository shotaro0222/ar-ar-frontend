import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'ニュースクイズ｜今日のニュースから出題、終わらない4択クイズ',
  description: '毎日更新のニュースから出題される無料の4択クイズ。連続正解ボーナスとレベルアップ、今日のランキングで遊べます。',
  alternates: { canonical: '/play' },
  openGraph: { url: '/play', title: 'ニュースクイズ｜News Summoner', description: '毎日更新のニュースから出題される、終わらない4択クイズ。', images: ['/og.png'] }
};
export default function L({ children }: { children: React.ReactNode }) { return children; }
