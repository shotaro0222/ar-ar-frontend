'use client';

// スマホで答えるアンケート：/q?s=アンケートID&d=サイネージ端末キー
// タッチできないサイネージに表示したQRコードから開く

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import SurveyRunner from '../components/SurveyRunner';
import { API_BASE } from '../lib/api';
import { trackEvent } from '../lib/analytics';
import { SubmitResult } from '../lib/survey';

function Inner() {
  const params = useSearchParams();
  const id = params.get('s') || '';
  const device = params.get('d') || '';
  const [survey, setSurvey] = useState<any>(null);
  const [error, setError] = useState('');
  const [already, setAlready] = useState(false);

  useEffect(() => {
    if (!id) { setError('アンケートが指定されていません'); return; }
    try { if (localStorage.getItem(`ns-survey-${id}`)) setAlready(true); } catch { /* noop */ }
    fetch(`${API_BASE}/api/survey?id=${encodeURIComponent(id)}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); setSurvey(d); trackEvent('survey_view', { survey: id }); })
      .catch(e => setError(e.message || '読み込めませんでした'));
  }, [id]);

  const submit = async (answers: Record<string, any>): Promise<SubmitResult> => {
    const r = await fetch(`${API_BASE}/api/survey/submit`, { method: 'POST', body: JSON.stringify({ id, answers, device: device || undefined, via: device ? 'qr' : 'web' }) });
    const d = await r.json();
    if (r.ok) {
      try { localStorage.setItem(`ns-survey-${id}`, '1'); } catch { /* noop */ }
      trackEvent('survey_complete', { survey: id, via: device ? 'signage_qr' : 'web' });
    }
    return r.ok ? d : { error: d?.error || '送信できませんでした' };
  };

  return (
    <div className="pg-root">
      <header className="pg-head"><a href="/">🔮 News Summoner</a></header>
      <main className="pg-main">
        {error ? <p className="pg-msg">{error}</p>
          : !survey ? <p className="pg-msg">読み込み中…</p>
          : already ? (
            <div className="pg-msg">
              <p>このアンケートには回答済みです。ご協力ありがとうございました！</p>
              <button className="sv-btn sv-sub" onClick={() => setAlready(false)}>もう一度回答する</button>
            </div>
          ) : <SurveyRunner survey={survey} onSubmit={submit} />}
      </main>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
