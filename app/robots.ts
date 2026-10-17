import type { MetadataRoute } from 'next';
import { SITE_URL } from './lib/site';

export const dynamic = 'force-static';

// 管理・契約者・端末専用の画面は検索に出さない
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/signage', '/widget', '/q'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL
  };
}
