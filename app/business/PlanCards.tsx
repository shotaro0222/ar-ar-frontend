'use client';

// LP の料金カード：管理画面で設定した価格・Stripe 支払いリンクで表示を更新し、申し込みを計測する
import React, { useEffect, useState } from 'react';
import { API_BASE, track } from '../lib/api';
import { trackEvent } from '../lib/analytics';
import { DEFAULT_PLANS, SignagePlan } from '../lib/plans';

export default function PlanCards() {
  const [plans, setPlans] = useState<SignagePlan[]>(DEFAULT_PLANS);
  const [contact, setContact] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/config`).then(r => r.json()).then(d => {
      if (Array.isArray(d?.signagePlans) && d.signagePlans.length) setPlans(d.signagePlans);
      if (d?.contactUrl) setContact(d.contactUrl);
    }).catch(() => {});
  }, []);

  const checkout = (p: SignagePlan) => {
    trackEvent('signage_checkout', { plan: p.id, value: p.price, currency: 'JPY' });
    track('lp_cta', `checkout-${p.id}`, false);
  };

  return (
    <>
      <div className="lp-plans">
        {plans.map(p => {
          // Stripe の支払いリンクにプランIDを付け、支払い後にどのプランか判別する
          const href = p.linkUrl ? `${p.linkUrl}${p.linkUrl.includes('?') ? '&' : '?'}client_reference_id=${p.id}` : contact || '#contact';
          return (
            <div key={p.id} className={`lp-plan${p.recommended ? ' is-rec' : ''}`}>
              {p.recommended && <span className="lp-badge">おすすめ</span>}
              <h3>{p.name}</h3>
              <div className="lp-price"><b>{p.price.toLocaleString()}</b>円<small>／{p.interval}・1画面（税込）</small></div>
              <ul>{p.features.map(f => <li key={f}>{f}</li>)}</ul>
              <a className="lp-cta" href={href} target={p.linkUrl ? undefined : '_blank'} rel="noreferrer" onClick={() => checkout(p)}>
                {p.linkUrl ? 'このプランで申し込む' : '問い合わせる'}
              </a>
            </div>
          );
        })}
      </div>
      <p className="lp-note">初期費用0円・最低契約期間なし（月単位でいつでも解約できます）。お支払いはStripeの安全な決済ページで行います。</p>
      {contact && (
        <p className="lp-note">10画面以上・自治体・請求書払いのご相談は <a href={contact} target="_blank" rel="noreferrer" onClick={() => trackEvent('lp_contact', { from: 'pricing' })}>こちら</a></p>
      )}
    </>
  );
}
