// マーケティング計測：GA4 / GTM / Meta Pixel にイベントを送る（タグ未設定なら何もしない）
type Params = Record<string, string | number | boolean | undefined>;

export function trackEvent(name: string, params: Params = {}) {
  if (typeof window === 'undefined') return;
  const w = window as any;
  try {
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event: name, ...params }); // GTM
    if (typeof w.gtag === 'function') w.gtag('event', name, params); // GA4
    // Meta Pixel：申し込み・問い合わせ系は標準イベントにも対応付ける
    if (typeof w.fbq === 'function') {
      if (name === 'signage_checkout') w.fbq('track', 'InitiateCheckout', params);
      else if (name === 'signage_contract') w.fbq('track', 'Purchase', params);
      else if (name === 'lp_contact') w.fbq('track', 'Lead', params);
      else w.fbq('trackCustom', name, params);
    }
  } catch { /* 計測の失敗で画面を止めない */ }
}
