'use client';

// /business の問い合わせフォーム（Formspree に送信）
import React, { useState } from 'react';
import { trackEvent } from '../lib/analytics';

const FORMSPREE_URL = 'https://formspree.io/f/mzedwpap';
const TOPICS = ['サイネージ導入の相談', '10画面以上・複数拠点', '自治体・観光での活用', '3D広告（スポンサー）掲載', 'XRウィジェット（メディア向け）', 'その他'];

export default function ContactForm({ topics = TOPICS, source = 'business', placeholder = '設置場所・画面数・ご希望の開始時期など、わかる範囲でご記入ください' }: { topics?: string[]; source?: string; placeholder?: string }) {
  const [f, setF] = useState({ company: '', name: '', email: '', phone: '', topic: topics[0], message: '', _gotcha: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const set = (patch: Partial<typeof f>) => setF(x => ({ ...x, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    setError('');
    try {
      const r = await fetch(FORMSPREE_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, _subject: `【News Summoner】${f.topic}：${f.company || f.name}`, _replyto: f.email, page: source })
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        throw new Error(d?.errors?.map((x: any) => x.message).join(' / ') || '送信できませんでした');
      }
      setState('done');
      trackEvent('lp_contact', { from: `contact_form_${source}`, topic: f.topic });
    } catch (err: any) {
      setState('error');
      setError(err.message || '送信できませんでした。時間をおいてお試しください');
    }
  };

  if (state === 'done') {
    return (
      <div className="ct-done">
        <h3>✅ お問い合わせを受け付けました</h3>
        <p>2営業日以内に、<b>{f.email}</b> 宛てにご連絡いたします。</p>
      </div>
    );
  }

  return (
    <form className="ap-form ct-form" onSubmit={submit}>
      <div className="ap-row">
        <label>会社名・団体名<input value={f.company} onChange={e => set({ company: e.target.value })} autoComplete="organization" /></label>
        <label>お名前<span>必須</span><input required value={f.name} onChange={e => set({ name: e.target.value })} autoComplete="name" /></label>
      </div>
      <div className="ap-row">
        <label>メールアドレス<span>必須</span><input required type="email" value={f.email} onChange={e => set({ email: e.target.value })} autoComplete="email" /></label>
        <label>電話番号<input value={f.phone} onChange={e => set({ phone: e.target.value })} autoComplete="tel" inputMode="tel" /></label>
      </div>
      <label>お問い合わせの種類
        <select value={f.topic} onChange={e => set({ topic: e.target.value })}>{topics.map(t => <option key={t}>{t}</option>)}</select>
      </label>
      <label>お問い合わせ内容<span>必須</span><textarea required rows={5} value={f.message} onChange={e => set({ message: e.target.value })} placeholder={placeholder} /></label>
      {/* ボット対策（Formspree の _gotcha。人には見えない） */}
      <input className="ap-hp" tabIndex={-1} autoComplete="off" value={f._gotcha} onChange={e => set({ _gotcha: e.target.value })} aria-hidden="true" />
      {state === 'error' && <p className="ap-error">{error}</p>}
      <button className="lp-cta" type="submit" disabled={state === 'sending'}>{state === 'sending' ? '送信中…' : '送信する'}</button>
      <p className="ap-small">ご入力いただいた情報は、お問い合わせへの回答のためにのみ利用します。</p>
    </form>
  );
}
