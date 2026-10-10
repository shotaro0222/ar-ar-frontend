'use client';

import React, { useState } from 'react';
import { PremiumState, PublicConfig, redeemCode } from '../lib/api';

type Props = {
  open: boolean;
  onClose: () => void;
  config: PublicConfig;
  premium: PremiumState;
  onActivated: (s: PremiumState) => void;
};

// プレミアムパスの案内と有効化（Stripe の支払いリンク、またはコード入力）
export default function PremiumSheet({ open, onClose, config, premium, onActivated }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!open) return null;

  const redeem = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setMsg('');
    const r = await redeemCode(code.trim()).catch(() => ({ active: false, error: '通信エラーが発生しました' }));
    setBusy(false);
    if (r.active) { onActivated(r); setMsg('プレミアムが有効になりました！'); setCode(''); }
    else setMsg((r as any).error || '有効化できませんでした');
  };

  const buyUrl = config.premium.linkUrl;

  return (
    <div className="ask-backdrop" onClick={onClose}>
      <div className="ask-sheet" role="dialog" aria-label="プレミアムパス" onClick={e => e.stopPropagation()}>
        <div className="ask-head">
          <div>
            <div className="ask-title">⭐ プレミアムパス</div>
            <div className="ask-context">
              {premium.active
                ? `有効です${premium.exp ? `（${new Date(premium.exp).toLocaleDateString('ja-JP')} まで）` : ''}`
                : '基本機能はすべて無料。演出と写真をもっと楽しめます'}
            </div>
          </div>
          <button className="ask-close" onClick={onClose} aria-label="閉じる">✕</button>
        </div>

        <ul className="pm-list">
          <li>🔥 炎・⚡ サイバー・🔮 魔法陣のエフェクト（魔法陣は6色）</li>
          <li>📸 AR写真をロゴなし・高画質で保存</li>
          <li>💜 開発の応援になります</li>
        </ul>

        {!premium.active && (
          <>
            {buyUrl ? (
              <a className="ask-send pm-buy" href={buyUrl} target="_blank" rel="noreferrer">
                {config.premium.price ? `${config.premium.price}で購入する` : '購入する'}
              </a>
            ) : (
              <div className="ask-empty">現在、購入の受付は準備中です。コードをお持ちの方は下から入力してください。</div>
            )}
            <form className="ask-form" onSubmit={e => { e.preventDefault(); redeem(); }}>
              <input className="ask-input" value={code} onChange={e => setCode(e.target.value)} placeholder="コード（例：ABCD-EFGH-JKLM）" maxLength={20} autoCapitalize="characters" />
              <button type="submit" className="ask-send" disabled={busy || !code.trim()}>有効化</button>
            </form>
          </>
        )}
        {msg && <div className={premium.active ? 'pm-ok' : 'ask-error'}>{msg}</div>}
        <div className="pm-note">お支払いは Stripe の安全な決済ページで行います。月額プランは Stripe からいつでも解約できます。</div>
      </div>
    </div>
  );
}
