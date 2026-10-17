// サイト全体の基本情報（SEO・OGP・構造化データで使う）
// 本番のURLは環境変数 NEXT_PUBLIC_SITE_URL に設定する（例：https://news-summoner.example.com）
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://news-summoner.pages.dev').replace(/\/$/, '');
export const SITE_NAME = 'News Summoner';
export const SITE_TAGLINE = 'AIアバターがニュースを読み上げるXRニュースサマリー';
export const SITE_DESCRIPTION =
  '最新ニュースをAIが要約し、3Dアバターが声と吹き出しで読み上げます。わからない言葉は会話で質問、現実空間（AR）でも聞けて、ニュースクイズでも遊べます。店舗・自治体向けのデジタルサイネージにも対応。';
export const ORG_NAME = process.env.NEXT_PUBLIC_ORG_NAME || 'News Summoner';

// 計測タグ（未設定なら読み込まない）
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || ''; // 例：G-XXXXXXX
export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || ''; // 例：GTM-XXXXXXX
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '';
export const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID || ''; // Microsoft Clarity（ヒートマップ）
