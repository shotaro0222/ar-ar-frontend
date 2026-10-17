'use client';

// 有料サイネージの申し込み完了ページ：Stripe の支払い後に /signage/start?session_id=cs_... で戻ってくる
// 支払いを確認して、専用のサイネージURLと設定（カスタマイズ）用URLを発行する

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE } from '../../lib/api';
import { trackEvent } from '../../lib/analytics';

type Claim = { deviceKey: string; ownerKey: string; plan: string; paidUntil: string };

function Inner() {
  const params = useSearchParams();
  const sessionId = params.get('session_id') || '';
  const [claim, setClaim] = useState<Claim | null>(null);
  const [error, setError] = useState('');
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    if (!sessionId) { setError('お支払い情報が見つかりません。お支払い完了メールのリンクから開いてください。'); return; }
    fetch(`${API_BASE}/api/signage/claim?session_id=${encodeURIComponent(sessionId)}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); setClaim(d); trackEvent('signage_contract', { plan: d.plan }); })
      .catch(e => setError(e.message || '確認できませんでした'));
  }, [sessionId]);

  const signageUrl = claim ? `${origin}/signage?device=${claim.deviceKey}&autostart=1` : '';
  const manageUrl = claim ? `${origin}/signage/manage?k=${claim.ownerKey}` : '';
  const copy = (t: string, k: string) => { navigator.clipboard?.writeText(t); setCopied(k); setTimeout(() => setCopied(''), 2000); };

  return (
    <div className="pg-root pg-light">
      <header className="pg-head"><a href="/business">🔮 News Summoner for Signage</a></header>
      <main className="pg-main pg-narrow">
        {error ? <p className="pg-msg">⚠ {error}</p> : !claim ? <p className="pg-msg">お支払いを確認しています…</p> : (
          <>
            <h1 className="pg-h1">🎉 お申し込みありがとうございます</h1>
            <p>{claim.plan === 'standard' ? 'スタンダード' : 'ライト'}プランが有効になりました（次回更新：{claim.paidUntil} ごろ）。下の2つのURLを必ず保存してください。</p>
            <div className="st-box">
              <h2>① サイネージに表示するURL</h2>
              <p>サイネージ端末（ブラウザ）でこのURLを開くと、すぐに表示が始まります。</p>
              <code>{signageUrl}</code>
              <button onClick={() => copy(signageUrl, 'sig')}>{copied === 'sig' ? 'コピーしました' : 'URLをコピー'}</button>
            </div>
            <div className="st-box st-key">
              <h2>② 表示内容を変える管理URL（他の人に教えないでください）</h2>
              <p>ローカルニュースの追加・キーワード設定、アンケートの作成、表示モードの切り替えができます。変更は1分ほどでサイネージに反映されます。</p>
              <code>{manageUrl}</code>
              <div className="st-row">
                <button onClick={() => copy(manageUrl, 'man')}>{copied === 'man' ? 'コピーしました' : 'URLをコピー'}</button>
                <a className="st-primary" href={manageUrl}>今すぐ設定する →</a>
              </div>
            </div>
            <div className="st-box">
              <h2>端末の設定のコツ</h2>
              <ul>
                <li>音声を自動で流すには、Chrome を <code>--kiosk --autoplay-policy=no-user-gesture-required</code> を付けて起動します。</li>
                <li>タッチできない画面は、管理URLで「タッチ操作なし」にすると、QRコードからスマホで参加する表示になります。</li>
                <li>このページは再読み込みしても同じURLが表示されます。</li>
              </ul>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
