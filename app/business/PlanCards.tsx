'use client';

// LP の料金カード：管理画面で設定した価格で表示を更新し、申し込みを計測する
// 支払い方法が「振込」のときは申し込みフォーム、「Stripe」のときは支払いリンクへ進む
import React, { useEffect, useState } from 'react';
import { API_BASE, track } from '../lib/api';
import { trackEvent } from '../lib/analytics';
import { DEFAULT_PLANS, SignagePlan } from '../lib/plans';
import ApplyForm from './ApplyForm';

export default function PlanCards() {
  const [plans, setPlans] = useState<SignagePlan[]>(DEFAULT_PLANS);
  const [contact, setContact] = useState('');
  const [mode, setMode] = useState<'bank' | 'stripe'>('bank');
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/config`).then(r => r.json()).then(d => {
      if (Array.isArray(d?.signagePlans) && d.signagePlans.length) setPlans(d.signagePlans);
      if (d?.contactUrl) setContact(d.contactUrl);
      if (d?.paymentMode === 'stripe') setMode('stripe');
    }).catch(() => {});
  }, []);

  const checkout = (p: SignagePlan, e: React.MouseEvent) => {
    trackEvent('signage_checkout', { plan: p.id, value: p.price, currency: 'JPY' });
    track('lp_cta', `checkout-${p.id}`, false);
    if (!(mode === 'stripe' && p.linkUrl)) { e.preventDefault(); setApplying(p.id); } // 振込：申し込みフォームを開く
  };

  return (
    <>
      <div className="lp-plans">
        {plans.map(p => {
          // Stripe の支払いリンクにはプランIDを付け、支払い後にどのプランか判別する
          const stripe = mode === 'stripe' && p.linkUrl;
          const href = stripe ? `${p.linkUrl}${p.linkUrl!.includes('?') ? '&' : '?'}client_reference_id=${p.id}` : '#apply';
          return (
            <div key={p.id} className={`lp-plan${p.recommended ? ' is-rec' : ''}`}>
              {p.recommended && <span className="lp-badge">おすすめ</span>}
              <h3>{p.name}</h3>
              <div className="lp-price"><b>{p.price.toLocaleString()}</b>円<small>／{p.interval}・1画面（税込）</small></div>
              <ul>{p.features.map(f => <li key={f}>{f}</li>)}</ul>
              <a className="lp-cta" href={href} rel="noreferrer" onClick={e => checkout(p, e)}>このプランで申し込む</a>
            </div>
          );
        })}
      </div>
      <p className="lp-note">初期費用0円・最低契約期間なし（月単位でいつでも解約できます）。{mode === 'stripe' ? 'お支払いはStripeの安全な決済ページで行います。' : 'お支払いは銀行振込（請求書払い）です。ご入金確認後に専用URLをお送りします。'}</p>
      {applying && <ApplyForm plans={plans} initialPlan={applying} onClose={() => setApplying(null)} />}
      <p className="lp-note">10画面以上・自治体・まとめ払いのご相談は <a href="#contact" onClick={() => trackEvent('lp_contact_click', { from: 'pricing' })}>お問い合わせフォーム</a> から</p>
    </>
  );
}
