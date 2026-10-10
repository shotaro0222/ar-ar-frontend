// バックエンド（Cloudflare Workers）との通信とプレミアム状態の管理
export const API_BASE = 'https://xr-reference.kyouhitotsu-dev.workers.dev';

export type Placement = {
  id: string;
  type: 'sponsor' | 'local';
  title: string;
  sponsor: string;
  description: string;
  glbUrl: string;
  linkUrl?: string;
  linkLabel?: string;
  keywords: string[];
  region?: string;
  realScale?: boolean;
};

export type PublicConfig = {
  placements: Placement[];
  premium: { enabled: boolean; linkUrl?: string; price?: string; stripe?: boolean };
  contactUrl?: string;
};

export const EMPTY_CONFIG: PublicConfig = { placements: [], premium: { enabled: false } };

export async function fetchConfig(): Promise<PublicConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    if (!res.ok) return EMPTY_CONFIG;
    const d = await res.json();
    return { ...EMPTY_CONFIG, ...d, placements: Array.isArray(d?.placements) ? d.placements : [] };
  } catch {
    return EMPTY_CONFIG;
  }
}

// スポンサー3Dを出すニュースか（タイトル・要約にキーワードが含まれるか）
export function sponsorFor(placements: Placement[], text: string): Placement | undefined {
  if (!text) return undefined;
  return placements.find(p => p.type === 'sponsor' && p.keywords.some(k => k && text.includes(k)));
}

// 表示・タップの記録（同じ記録は1回の閲覧で1度だけ送る）
const sent = new Set<string>();
export function track(kind: string, ref: string, once = true) {
  const key = `${kind}:${ref}`;
  if (once && sent.has(key)) return;
  sent.add(key);
  try {
    const body = JSON.stringify({ kind, ref });
    if (navigator.sendBeacon) navigator.sendBeacon(`${API_BASE}/api/event`, new Blob([body], { type: 'text/plain' }));
    else fetch(`${API_BASE}/api/event`, { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch { /* noop */ }
}

// ---------------- プレミアム ----------------
const TOKEN_KEY = 'ns-premium-token';
const readToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
const saveToken = (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* noop */ } };

export type PremiumState = { active: boolean; exp?: number };

// 保存済みの証明を確認（月額は期限が近いと自動で延長される）
export async function checkPremium(): Promise<PremiumState> {
  const token = readToken();
  if (!token) return { active: false };
  try {
    const res = await fetch(`${API_BASE}/api/premium/status`, { method: 'POST', body: JSON.stringify({ token }) });
    const d = await res.json();
    if (d?.token) saveToken(d.token);
    return { active: !!d?.active, exp: d?.exp };
  } catch {
    return { active: false };
  }
}

export async function redeemCode(code: string): Promise<PremiumState & { error?: string }> {
  const res = await fetch(`${API_BASE}/api/premium/redeem`, { method: 'POST', body: JSON.stringify({ code }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.token) return { active: false, error: d?.error || '有効化できませんでした' };
  saveToken(d.token);
  return { active: true, exp: d.exp };
}

// Stripe の支払い完了後（?premium_session=cs_... で戻ってくる）
export async function claimStripe(sessionId: string): Promise<PremiumState & { error?: string }> {
  const res = await fetch(`${API_BASE}/api/premium/claim?session_id=${encodeURIComponent(sessionId)}`);
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.token) return { active: false, error: d?.error || '確認できませんでした' };
  saveToken(d.token);
  return { active: true, exp: d.exp };
}
