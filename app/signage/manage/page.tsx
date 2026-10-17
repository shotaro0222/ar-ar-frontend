'use client';

// サイネージ契約者の設定画面：/signage/manage?k=管理キー
// 表示モードの切り替え、ローカルニュース（手入力・キーワード収集）、アンケートの作成と集計、引換番号の確認

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import SurveyEditor from '../../components/SurveyEditor';
import SurveyResults from '../../components/SurveyResults';
import { API_BASE } from '../../lib/api';
import { Agg, newSurvey, Survey, surveyProblems } from '../../lib/survey';

type LocalItem = { id: string; title: string; description: string; linkUrl?: string };
type Device = {
  id: string; name: string; key: string; region?: string; plan: string; paidUntil?: string; stripeSub?: string; touch: boolean;
  mode: 'news' | 'survey' | 'quiz' | 'mix'; surveyId?: string; localItems: LocalItem[]; localKeywords: string[] | string; localFeeds: string[] | string;
};
type Tab = 'basic' | 'local' | 'survey' | 'claim';

const MODE_LABEL: Record<Device['mode'], string> = {
  news: '📰 ニュース（ローカル・3Dを含む読み上げ）',
  mix: '🔀 ミックス（ニュースの合間にアンケート・クイズの案内）',
  survey: '📝 アンケート専用',
  quiz: '🎮 クイズ専用'
};
const rid = () => Math.random().toString(36).slice(2, 10);
const joinList = (v: string[] | string | undefined) => (Array.isArray(v) ? v.join(', ') : v || '');

function Inner() {
  const params = useSearchParams();
  const [key, setKey] = useState('');
  const [dev, setDev] = useState<Device | null>(null);
  const [active, setActive] = useState(true);
  const [features, setFeatures] = useState({ survey: false, quiz: true, talk: false });
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [aggs, setAggs] = useState<Record<string, Agg>>({});
  const [tab, setTab] = useState<Tab>('basic');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [origin, setOrigin] = useState('');
  const [code, setCode] = useState('');
  const [payment, setPayment] = useState<{ mode: 'bank' | 'stripe'; bankInfo: string | null }>({ mode: 'bank', bankInfo: null });
  const [claim, setClaim] = useState<any>(null);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${key}` } });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d?.error || `エラー（${res.status}）`);
    return d;
  }, [key]);

  useEffect(() => {
    setOrigin(window.location.origin);
    const k = params.get('k') || localStorage.getItem('ns-owner') || '';
    if (k) { setKey(k); try { localStorage.setItem('ns-owner', k); } catch { /* noop */ } }
  }, [params]);

  const load = useCallback(() => {
    if (!key) return;
    api('/api/owner/device').then(d => {
      setDev(d.device); setActive(d.active); setFeatures(d.features); setSurveys(d.surveys || []); setAggs(d.aggs || {}); setDirty(false);
      if (d.payment) setPayment(d.payment);
    }).catch(e => setMsg(e.message));
  }, [key, api]);
  useEffect(load, [load]);

  const set = (patch: Partial<Device>) => { setDev(d => (d ? { ...d, ...patch } : d)); setDirty(true); };

  const save = async () => {
    if (!dev) return;
    setBusy(true); setMsg('');
    try {
      if (features.survey) {
        const bad = surveys.find(s => s.active && surveyProblems(s).length);
        if (bad) throw new Error(`アンケート「${bad.title || '無題'}」に未入力の項目があります`);
        await api('/api/owner/surveys', { method: 'PUT', body: JSON.stringify({ surveys }) });
      }
      const d = await api('/api/owner/device', { method: 'PUT', body: JSON.stringify(dev) });
      setDev(d.device); setDirty(false);
      setMsg('保存しました。1分ほどでサイネージに反映されます');
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };

  const checkClaim = async (redeem: boolean) => {
    try { setClaim(await api(`/api/owner/claim?code=${encodeURIComponent(code.trim().toUpperCase())}`, { method: redeem ? 'POST' : 'GET' })); }
    catch (e: any) { setMsg(e.message); }
  };

  if (!key) return <div className="ad-root ad-login"><h1>🔮 サイネージ設定</h1><p>お申し込み完了ページに表示された「管理URL」から開いてください。</p></div>;
  if (!dev) return <div className="ad-root ad-login"><h1>🔮 サイネージ設定</h1><p>{msg || '読み込み中…'}</p></div>;

  const signageUrl = `${origin}/signage?device=${dev.key}&autostart=1`;
  const liveSurveys = surveys.filter(s => s.active);

  return (
    <div className="ad-root">
      <header className="ad-head">
        <h1>🔮 {dev.name}</h1>
        <nav>
          {([['basic', '⚙️ 表示'], ['local', '📍 ローカル'], ['survey', '📝 アンケート'], ['claim', '🎟 引換番号']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
        <div className="ad-save">
          <a className="ad-sub ad-btnlink" href={signageUrl} target="_blank" rel="noreferrer">サイネージを開く</a>
          <button onClick={save} disabled={!dirty || busy}>{busy ? '保存中…' : dirty ? '💾 保存する' : '保存済み'}</button>
        </div>
      </header>
      {msg && <p className="ad-msg" onClick={() => setMsg('')}>{msg}</p>}
      {!active && <p className="ad-msg">⚠ ご契約の有効期限（{dev.paidUntil}）が切れています。{dev.stripeSub ? 'お支払いが確認されると自動で再開します。' : 'お振込みを確認次第、表示を再開します。'}</p>}
      <main>
        {tab === 'basic' && (
          <section>
            <div className="ad-card">
              <div className="ad-row">
                <label className="ad-field"><span>設置場所・名前</span><input value={dev.name} onChange={e => set({ name: e.target.value })} /></label>
                <label className="ad-field"><span>地域名（会話で地域の案内に使います）</span><input value={dev.region || ''} onChange={e => set({ region: e.target.value })} placeholder="例：立川" /></label>
              </div>
              <label className="ad-field"><span>表示モード（保存すると約1分でサイネージが切り替わります）</span>
                <select value={dev.mode} onChange={e => set({ mode: e.target.value as Device['mode'] })}>
                  {(Object.keys(MODE_LABEL) as Device['mode'][]).map(m => (
                    <option key={m} value={m} disabled={m === 'survey' && !features.survey}>{MODE_LABEL[m]}{m === 'survey' && !features.survey ? '（スタンダード）' : ''}</option>
                  ))}
                </select>
              </label>
              {(dev.mode === 'survey' || dev.mode === 'mix') && features.survey && (
                <label className="ad-field"><span>表示するアンケート</span>
                  <select value={dev.surveyId || ''} onChange={e => set({ surveyId: e.target.value || undefined })}>
                    <option value="">（選んでください）</option>
                    {liveSurveys.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  {!liveSurveys.length && <small>「アンケート」タブで作成し、「公開中」にしてください</small>}
                </label>
              )}
              <label className="ad-toggle"><input type="checkbox" checked={dev.touch} onChange={e => set({ touch: e.target.checked })} /> タッチ操作できる画面（オフにすると、QRコードからスマホで参加する表示になります）</label>
            </div>
            <div className="ad-card">
              <h3>ご契約</h3>
              <p className="ad-small">プラン：{dev.plan === 'standard' ? 'スタンダード' : dev.plan === 'lite' ? 'ライト' : '法人契約'}{dev.paidUntil ? `／ご利用期限：${dev.paidUntil}` : ''}</p>
              {!dev.stripeSub && dev.paidUntil && (
                <div className="ad-alert">
                  <b>💴 継続のお支払い</b>
                  <p className="ad-small" style={{ margin: '4px 0' }}>ご利用期限（{dev.paidUntil}）までに次の期間分をお振込みください。入金を確認後、期限を延長します（表示は止まりません）。</p>
                  {payment.bankInfo && <pre className="ad-bank">{payment.bankInfo}</pre>}
                </div>
              )}
              <label className="ad-field"><span>サイネージURL</span><input readOnly value={signageUrl} onFocus={e => e.target.select()} /></label>
            </div>
          </section>
        )}

        {tab === 'local' && (
          <section>
            <div className="ad-card">
              <h3>🔎 キーワードで自動収集</h3>
              <p className="ad-small">登録したキーワードを含むニュースを、配信中のニュースと下のRSSから自動で集めて表示します（1日2回更新）。</p>
              <label className="ad-field"><span>キーワード（カンマ区切り）</span><input value={joinList(dev.localKeywords)} onChange={e => set({ localKeywords: e.target.value })} placeholder="例：立川, 昭島, 多摩" /></label>
              <label className="ad-field"><span>追加で読むRSS（市役所・観光協会などの新着情報、カンマ区切り）</span><input value={joinList(dev.localFeeds)} onChange={e => set({ localFeeds: e.target.value })} placeholder="https://www.city.example.lg.jp/rss.xml" /></label>
            </div>
            <div className="ad-card">
              <div className="ad-card-head">
                <span className="ad-type">✍️ お店・地域のお知らせ（手入力）</span>
                <button onClick={() => set({ localItems: [{ id: rid(), title: '', description: '' }, ...dev.localItems] })}>＋ 追加</button>
              </div>
              {dev.localItems.length === 0 && <p className="ad-empty">新メニュー、イベント、地域の話題などを入れると、アバターがニュースと一緒に読み上げます。</p>}
              {dev.localItems.map((it, i) => (
                <div key={it.id} className="ad-local">
                  <input value={it.title} placeholder="タイトル（例：秋限定ケーキが登場）" onChange={e => set({ localItems: dev.localItems.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)) })} />
                  <textarea rows={2} value={it.description} placeholder="アバターが読み上げる文（200字くらいまで）" maxLength={400}
                    onChange={e => set({ localItems: dev.localItems.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)) })} />
                  <div className="ad-row">
                    <input value={it.linkUrl || ''} placeholder="リンク（任意・QRで表示）https://" onChange={e => set({ localItems: dev.localItems.map((x, k) => (k === i ? { ...x, linkUrl: e.target.value } : x)) })} />
                    <button className="ad-del" onClick={() => set({ localItems: dev.localItems.filter((_, k) => k !== i) })}>削除</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'survey' && (
          <section>
            {!features.survey ? (
              <div className="ad-card"><p>アンケート（分岐・マトリクス・回答特典・抽選）はスタンダードプランでご利用いただけます。</p><a href="/business#pricing">プランを見る</a></div>
            ) : (
              <>
                <div className="ad-intro">
                  <p>タッチ画面ではその場で、タッチできない画面ではQRコードからスマホで回答してもらえます。回答特典（クーポン・抽選）で回答率を上げられます。</p>
                  <button onClick={() => { setSurveys(s => [newSurvey(), ...s]); setDirty(true); }}>＋ アンケートを作る</button>
                </div>
                {surveys.map((s, i) => (
                  <div key={s.id}>
                    <SurveyEditor survey={s}
                      onChange={v => { setSurveys(list => list.map((x, k) => (k === i ? v : x))); setDirty(true); }}
                      onDelete={() => { setSurveys(list => list.filter((_, k) => k !== i)); setDirty(true); }} />
                    {aggs[s.id] && <div className="ad-card"><SurveyResults survey={s} agg={aggs[s.id]} onExport={async () => (await api(`/api/owner/export?id=${s.id}`)).rows} /></div>}
                  </div>
                ))}
              </>
            )}
          </section>
        )}

        {tab === 'claim' && (
          <section>
            <div className="ad-card">
              <h3>🎟 抽選の引換番号を確認</h3>
              <p className="ad-small">当選したお客様が見せた引換番号を入力すると、本物か・使用済みかを確認できます。</p>
              <div className="ad-row">
                <input value={code} onChange={e => setCode(e.target.value)} placeholder="例：A1B2C3" maxLength={10} />
                <button onClick={() => checkClaim(false)} disabled={!code}>確認</button>
              </div>
              {claim && (claim.valid ? (
                <div className={`ad-claim${claim.redeemed ? ' is-used' : ''}`}>
                  <b>{claim.redeemed ? '⚠ 使用済みです' : '✅ 有効な引換番号です'}</b>
                  <p>景品：{claim.prize || '-'}／当選日時：{new Date(claim.at).toLocaleString('ja-JP')}</p>
                  {!claim.redeemed && <button onClick={() => checkClaim(true)}>引き換え済みにする</button>}
                </div>
              ) : <p className="ad-msg">{claim.message}</p>)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
