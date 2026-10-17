'use client';

// サイネージの申し込みフォーム（振込・請求書払い用）
// 送信 → 管理者に通知 → 入金確認後に管理画面から有効化し、専用URLをメールで送る運用

import React, { useState } from 'react';
import { API_BASE } from '../lib/api';
import { trackEvent } from '../lib/analytics';
import { SignagePlan } from '../lib/plans';

type Done = { plan: { name: string; price: number; interval: string }; total: number; bankInfo: string | null; invoiceNote: string | null };

export default function ApplyForm({ plans, initialPlan, onClose }: { plans: SignagePlan[]; initialPlan: string; onClose: () => void }) {
  const [f, setF] = useState({ plan: initialPlan, screens: 1, company: '', name: '', email: '', phone: '', place: '', touch: true, note: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const set = (patch: Partial<typeof f>) => setF(x => ({ ...x, ...patch }));
  const plan = plans.find(p => p.id === f.plan) || plans[0];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`${API_BASE}/api/signage/apply`, { method: 'POST', body: JSON.stringify(f) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || '送信できませんでした');
      setDone(d);
      trackEvent('signage_apply', { plan: f.plan, screens: f.screens, value: (plan?.price || 0) * f.screens, currency: 'JPY' });
      trackEvent('lp_contact', { from: 'apply_form' });
    } catch (err: any) {
      setError(err.message || '送信できませんでした。時間をおいてお試しください');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ap-backdrop" onClick={onClose}>
      <div className="ap-modal" role="dialog" aria-label="お申し込み" onClick={e => e.stopPropagation()}>
        <button className="ap-close" onClick={onClose} aria-label="閉じる">✕</button>
        {done ? (
          <div className="ap-done">
            <h2>✅ お申し込みを受け付けました</h2>
            <p>
              {done.plan.name}プラン × {f.screens}画面（月額 <b>{done.total.toLocaleString()}円</b>・税込）
            </p>
            <ol className="ap-steps">
              <li><b>お振込み</b>{done.invoiceNote ? `：${done.invoiceNote}` : '：下記の口座へ初月分をお振込みください。'}</li>
              <li><b>入金確認</b>：確認後、<b>{f.email}</b> 宛てにサイネージ用URLと設定用URLをお送りします。</li>
              <li><b>表示開始</b>：サイネージのブラウザでURLを開くだけで始まります。</li>
            </ol>
            {done.bankInfo && (
              <div className="ap-bank">
                <small>お振込み先</small>
                <pre>{done.bankInfo}</pre>
                <small>※ 振込手数料はお客様のご負担となります。お振込み名義の前にお申し込み時の会社名を入れてください。</small>
              </div>
            )}
            <p className="ap-small">この画面の内容は控えとして保存（スクリーンショット）をおすすめします。</p>
            <button className="lp-cta" onClick={onClose}>閉じる</button>
          </div>
        ) : (
          <form onSubmit={submit} className="ap-form">
            <h2>お申し込み</h2>
            <p className="ap-small">お支払いは銀行振込（請求書払い）です。ご入金を確認後、専用URLをお送りします。</p>
            <div className="ap-row">
              <label>プラン
                <select value={f.plan} onChange={e => set({ plan: e.target.value })}>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name}（月額 {p.price.toLocaleString()}円）</option>)}
                </select>
              </label>
              <label>画面数
                <input type="number" min={1} max={100} value={f.screens} onChange={e => set({ screens: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
              </label>
            </div>
            <label>会社名・店舗名<span>必須</span><input required value={f.company} onChange={e => set({ company: e.target.value })} autoComplete="organization" /></label>
            <div className="ap-row">
              <label>ご担当者名<span>必須</span><input required value={f.name} onChange={e => set({ name: e.target.value })} autoComplete="name" /></label>
              <label>電話番号<input value={f.phone} onChange={e => set({ phone: e.target.value })} autoComplete="tel" inputMode="tel" /></label>
            </div>
            <label>メールアドレス<span>必須</span><input required type="email" value={f.email} onChange={e => set({ email: e.target.value })} autoComplete="email" /></label>
            <label>設置場所<input value={f.place} onChange={e => set({ place: e.target.value })} placeholder="例：立川駅北口店 レジ横" /></label>
            <label className="ap-check"><input type="checkbox" checked={f.touch} onChange={e => set({ touch: e.target.checked })} /> タッチ操作できる画面です</label>
            <label>ご要望・備考<textarea rows={3} value={f.note} onChange={e => set({ note: e.target.value })} placeholder="開始希望日、請求書の宛名など" /></label>
            {/* ボット対策：人には見えない入力欄 */}
            <input className="ap-hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={e => set({ website: e.target.value })} aria-hidden="true" />
            <div className="ap-total">月額合計：<b>{((plan?.price || 0) * f.screens).toLocaleString()}円</b>（税込）</div>
            {error && <p className="ap-error">{error}</p>}
            <button className="lp-cta" type="submit" disabled={busy}>{busy ? '送信中…' : '申し込む（お支払いは振込）'}</button>
            <p className="ap-small">送信すると、ご入力の内容をサービス提供のために利用することに同意したものとみなします。</p>
          </form>
        )}
      </div>
    </div>
  );
}
