import type { MetadataRoute } from 'next';
import { SITE_URL } from './lib/site';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE_URL}/business`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/play`, lastModified: now, changeFrequency: 'daily', priority: 0.7 }
  ];
}
