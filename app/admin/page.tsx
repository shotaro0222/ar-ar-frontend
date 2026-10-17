'use client';

// 管理画面：掲載枠（スポンサー／ローカル）・提携メディア・サイネージ端末・プレミアム・集計
// ログインには Workers に設定した ADMIN_TOKEN を使う（ブラウザのタブを閉じると消える）

import React, { useCallback, useEffect, useState } from 'react';
import Script from 'next/script';
import { API_BASE } from '../lib/api';
import SurveyEditor from '../components/SurveyEditor';
import SurveyResults from '../components/SurveyResults';
import { Agg, newSurvey, Survey, surveyProblems } from '../lib/survey';

type Placement = {
  id: string; type: 'sponsor' | 'local'; active: boolean; title: string; sponsor: string; description: string;
  glbUrl: string; linkUrl?: string; linkLabel?: string; keywords?: string[] | string; region?: string;
  realScale?: boolean; startAt?: string; endAt?: string;
};
type Partner = { id: string; name: string; domains: string[] | string; active: boolean; plan?: string; note?: string };
type Device = {
  id: string; name: string; key: string; active: boolean; region?: string;
  plan?: 'lite' | 'standard' | 'internal'; paidUntil?: string; ownerKey?: string; contact?: string; stripeSub?: string;
  touch?: boolean; mode?: 'news' | 'survey' | 'quiz' | 'mix'; surveyId?: string;
  localKeywords?: string[] | string; localFeeds?: string[] | string; localItems?: any[];
};
type Plan = { id: string; name: string; price: number; interval: string; features: string[] | string; linkUrl?: string; recommended?: boolean };
type Topic = { id: string; region: string; keywords: string[] | string; feeds: string[] | string };
type Settings = {
  premiumEnabled: boolean; premiumLinkUrl?: string; premiumPrice?: string; premiumDays?: number; contactUrl?: string;
  signagePlans?: Plan[]; localTopics?: Topic[];
};
type Config = {
  placements: Placement[]; partners: Partner[]; devices: Device[]; settings: Settings; surveys: Survey[]; rev?: string;
  features?: { stats: boolean; assets: boolean; stripe: boolean };
};
type Tab = 'placements' | 'partners' | 'devices' | 'surveys' | 'premium' | 'settings' | 'stats';

const KIND_LABEL: Record<string, string> = {
  sponsor_impression: 'スポンサー表示', sponsor_open: 'スポンサー3D表示', sponsor_link: 'スポンサーリンク',
  local_impression: 'ローカル表示', local_open: 'ローカル3D表示', local_link: 'ローカルリンク',
  photo: 'AR写真', embed_view: 'ウィジェット表示', embed_play: 'ウィジェット再生',
  signage_play: 'サイネージ再生', signage_talk: 'サイネージ会話', premium_activate: 'プレミアム有効化',
  survey_complete: 'アンケート回答', quiz_play: 'クイズ（ゲーム終了）', signage_contract: 'サイネージ新規契約', lp_cta: 'LPのボタン'
};

const rid = () => Math.random().toString(36).slice(2, 10);
const list = (v: string[] | string | undefined) => (Array.isArray(v) ? v.join(', ') : v || '');

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [input, setInput] = useState('');
  const [cfg, setCfg] = useState<Config | null>(null);
  const [tab, setTab] = useState<Tab>('placements');
  const [msg, setMsg] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState('');

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    const d = await res.json().catch(() => ({}));
    if (res.status === 401) { setToken(''); sessionStorage.removeItem('ns-admin'); throw new Error('ログインし直してください'); }
    if (!res.ok) throw new Error(d?.error || `エラー（${res.status}）`);
    return d;
  }, [token]);

  useEffect(() => {
    setOrigin(window.location.origin);
    const t = sessionStorage.getItem('ns-admin');
    if (t) setToken(t);
  }, []);

  useEffect(() => {
    if (!token) return;
    api('/api/admin/config').then(d => { setCfg({ ...d, surveys: d.surveys || [] }); setDirty(false); }).catch(e => setMsg(e.message));
  }, [token, api]);

  const reload = () => api('/api/admin/config').then(d => { setCfg({ ...d, surveys: d.surveys || [] }); setDirty(false); setMsg('最新の設定を読み込みました'); }).catch(e => setMsg(e.message));

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (fn: (c: Config) => Config) => { setCfg(c => (c ? fn(structuredClone(c)) : c)); setDirty(true); };

  const save = async () => {
    if (!cfg) return;
    setBusy(true);
    setMsg('');
    try {
      const bad = cfg.surveys.find(sv => sv.active && surveyProblems(sv).length);
      if (bad) throw new Error(`アンケート「${bad.title || '無題'}」に未入力の項目があります（公開中のものは修正が必要です）`);
      const saved = await api('/api/admin/config', { method: 'PUT', body: JSON.stringify(cfg) });
      setCfg(c => ({ ...saved, rev: saved.rev, features: c?.features }));
      setDirty(false);
      setMsg('保存しました（公開画面への反映は最大1分ほどかかります）');
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="ad-root ad-login">
        <h1>🔮 News Summoner 管理画面</h1>
        <form onSubmit={e => { e.preventDefault(); sessionStorage.setItem('ns-admin', input); setToken(input); }}>
          <input type="password" value={input} onChange={e => setInput(e.target.value)} placeholder="管理トークン（ADMIN_TOKEN）" autoComplete="current-password" />
          <button type="submit" disabled={!input}>ログイン</button>
        </form>
        {msg && <p className="ad-msg">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="ad-root">
      <Script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js" />
      <header className="ad-head">
        <h1>🔮 管理画面</h1>
        <nav>
          {([['placements', '🎁 3D掲載枠'], ['partners', '🤝 提携メディア'], ['devices', '📺 サイネージ'], ['surveys', '📝 サーベイ'], ['premium', '⭐ プレミアム'], ['settings', '⚙️ 料金・ローカル'], ['stats', '📊 集計']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
        <div className="ad-save">
          <button className="ad-sub" onClick={reload} disabled={busy}>↻ 再読み込み</button>
          {tab !== 'stats' && <button onClick={save} disabled={!dirty || busy}>{busy ? '保存中…' : dirty ? '💾 保存する' : '保存済み'}</button>}
          <button className="ad-sub" onClick={() => { sessionStorage.removeItem('ns-admin'); setToken(''); setCfg(null); }}>ログアウト</button>
        </div>
      </header>
      {msg && <p className="ad-msg" onClick={() => setMsg('')}>{msg}</p>}
      {!cfg ? <p>読み込み中…</p> : (
        <main>
          {tab === 'placements' && <Placements cfg={cfg} update={update} api={api} setMsg={setMsg} />}
          {tab === 'partners' && <Partners cfg={cfg} update={update} origin={origin} />}
          {tab === 'devices' && <Devices cfg={cfg} update={update} origin={origin} />}
          {tab === 'surveys' && <Surveys cfg={cfg} update={update} api={api} origin={origin} />}
          {tab === 'premium' && <Premium cfg={cfg} update={update} api={api} origin={origin} />}
          {tab === 'settings' && <SettingsTab cfg={cfg} update={update} api={api} origin={origin} setMsg={setMsg} />}
          {tab === 'stats' && <Stats cfg={cfg} api={api} />}
        </main>
      )}
    </div>
  );
}

type Sub = { cfg: Config; update: (fn: (c: Config) => Config) => void };

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="ad-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

// ---------------- 3D掲載枠 ----------------
function Placements({ cfg, update, api, setMsg }: Sub & { api: any; setMsg: (m: string) => void }) {
  const [uploading, setUploading] = useState<number | null>(null);
  const set = (i: number, patch: Partial<Placement>) => update(c => { c.placements[i] = { ...c.placements[i], ...patch }; return c; });
  const add = (type: 'sponsor' | 'local') => update(c => {
    c.placements.unshift({ id: rid(), type, active: false, title: '', sponsor: '', description: '', glbUrl: '', keywords: [], realScale: type === 'sponsor' });
    return c;
  });

  const upload = async (i: number, file: File) => {
    setUploading(i);
    try {
      const d = await api(`/api/admin/upload?name=${encodeURIComponent(file.name)}`, {
        method: 'POST', body: file, headers: { 'Content-Type': file.type || 'model/gltf-binary' }
      });
      set(i, { glbUrl: d.url });
      setMsg('アップロードしました。「保存する」で確定します');
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setUploading(null);
    }
  };

  return (
    <section>
      <div className="ad-intro">
        <p><b>スポンサー</b>：キーワードを含むニュースに「🎁 3Dで見る（PR）」が出ます。<b>ローカル</b>：「📍ローカル」カテゴリに独自ニュースとして並び、サイネージでも紹介されます。</p>
        <div className="ad-row">
          <button onClick={() => add('sponsor')}>＋ スポンサー枠</button>
          <button onClick={() => add('local')}>＋ ローカル枠</button>
        </div>
      </div>
      {cfg.placements.length === 0 && <p className="ad-empty">まだ掲載枠がありません</p>}
      {cfg.placements.map((p, i) => (
        <div key={p.id} className={`ad-card${p.active ? '' : ' is-off'}`}>
          <div className="ad-card-head">
            <span className="ad-type">{p.type === 'sponsor' ? '🎁 スポンサー（PR）' : '📍 ローカル'}</span>
            <label className="ad-toggle"><input type="checkbox" checked={p.active} onChange={e => set(i, { active: e.target.checked })} /> 掲載中</label>
            <button className="ad-del" onClick={() => confirm(`「${p.title || '無題'}」を削除しますか？`) && update(c => { c.placements.splice(i, 1); return c; })}>削除</button>
          </div>
          <div className="ad-grid">
            <div>
              <Field label="タイトル"><input value={p.title} onChange={e => set(i, { title: e.target.value })} placeholder={p.type === 'sponsor' ? '例：新型EV「〇〇」' : '例：国営昭和記念公園'} /></Field>
              <Field label={p.type === 'sponsor' ? '提供企業名（PR表記に使用）' : '提供者（自治体・観光協会など）'}><input value={p.sponsor} onChange={e => set(i, { sponsor: e.target.value })} /></Field>
              {p.type === 'local' && <Field label="地域名" hint="サイネージ端末の地域と一致すると、会話で案内します"><input value={p.region || ''} onChange={e => set(i, { region: e.target.value })} placeholder="例：立川" /></Field>}
              <Field label="紹介文（吹き出し・読み上げ）"><textarea rows={4} value={p.description} onChange={e => set(i, { description: e.target.value })} maxLength={600} /></Field>
              {p.type === 'sponsor' && (
                <Field label="表示するニュースのキーワード" hint="カンマ区切り。タイトル・要約に含まれると表示">
                  <input value={list(p.keywords)} onChange={e => set(i, { keywords: e.target.value })} placeholder="例：EV, 電気自動車, 〇〇自動車" />
                </Field>
              )}
              <div className="ad-row">
                <Field label="リンク先URL（任意）"><input value={p.linkUrl || ''} onChange={e => set(i, { linkUrl: e.target.value })} placeholder="https://" /></Field>
                <Field label="リンクの文言"><input value={p.linkLabel || ''} onChange={e => set(i, { linkLabel: e.target.value })} placeholder="詳しく見る" /></Field>
              </div>
              <div className="ad-row">
                <Field label="掲載開始日"><input type="date" value={p.startAt || ''} onChange={e => set(i, { startAt: e.target.value })} /></Field>
                <Field label="掲載終了日"><input type="date" value={p.endAt || ''} onChange={e => set(i, { endAt: e.target.value })} /></Field>
              </div>
            </div>
            <div>
              <Field label="3Dモデル（GLB）" hint="ファイルを選ぶとサーバー（R2）に保存されます。URL直接入力も可">
                <input value={p.glbUrl} onChange={e => set(i, { glbUrl: e.target.value })} placeholder="https://…/model.glb" />
              </Field>
              <input type="file" accept=".glb,model/gltf-binary" disabled={uploading !== null || !cfg.features?.assets}
                onChange={e => e.target.files?.[0] && upload(i, e.target.files[0])} />
              {uploading === i && <small>アップロード中…</small>}
              {!cfg.features?.assets && <small>R2 が未設定のためアップロードできません</small>}
              <label className="ad-toggle"><input type="checkbox" checked={!!p.realScale} onChange={e => set(i, { realScale: e.target.checked })} /> ARで実物大に固定</label>
              <div className="ad-preview">
                {p.glbUrl ? <model-viewer src={p.glbUrl} auto-rotate="" camera-controls="" style={{ width: '100%', height: '100%' }} /> : <span>プレビュー</span>}
              </div>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

// ---------------- 提携メディア ----------------
function Partners({ cfg, update, origin }: Sub & { origin: string }) {
  const set = (i: number, patch: Partial<Partner>) => update(c => { c.partners[i] = { ...c.partners[i], ...patch }; return c; });
  return (
    <section>
      <div className="ad-intro">
        <p>記事ページに貼るだけで「このニュースをXRで見る」ボタンが出るウィジェットです。登録したドメインの記事だけで動作し、表示・再生回数は集計タブで確認できます。</p>
        <button onClick={() => update(c => { c.partners.unshift({ id: rid(), name: '', domains: [], active: true }); return c; })}>＋ 提携メディアを追加</button>
      </div>
      {cfg.partners.map((p, i) => (
        <div key={p.id} className={`ad-card${p.active ? '' : ' is-off'}`}>
          <div className="ad-card-head">
            <span className="ad-type">🤝 ID：{p.id}</span>
            <label className="ad-toggle"><input type="checkbox" checked={p.active} onChange={e => set(i, { active: e.target.checked })} /> 有効</label>
            <button className="ad-del" onClick={() => confirm('削除しますか？') && update(c => { c.partners.splice(i, 1); return c; })}>削除</button>
          </div>
          <div className="ad-row">
            <Field label="メディア名"><input value={p.name} onChange={e => set(i, { name: e.target.value })} /></Field>
            <Field label="許可するドメイン" hint="カンマ区切り。サブドメインも含む"><input value={list(p.domains)} onChange={e => set(i, { domains: e.target.value })} placeholder="example.co.jp" /></Field>
          </div>
          <div className="ad-row">
            <Field label="プラン"><input value={p.plan || ''} onChange={e => set(i, { plan: e.target.value })} placeholder="例：月額5万円 / レベニューシェア" /></Field>
            <Field label="メモ"><input value={p.note || ''} onChange={e => set(i, { note: e.target.value })} /></Field>
          </div>
          <Field label="埋め込みコード（記事テンプレートの本文下に貼る）">
            <textarea readOnly rows={2} value={`<script src="${origin}/widget.js" data-partner="${p.id}" async></script>`} onFocus={e => e.target.select()} />
          </Field>
        </div>
      ))}
    </section>
  );
}

// ---------------- サイネージ端末 ----------------
function Devices({ cfg, update, origin }: Sub & { origin: string }) {
  const set = (i: number, patch: Partial<Device>) => update(c => { c.devices[i] = { ...c.devices[i], ...patch }; return c; });
  return (
    <section>
      <div className="ad-intro">
        <p>サイネージ用のURLを端末ごとに発行します。端末キー付きのURLは会話の回数制限がゆるく、同じ地域のローカル枠の情報を会話で案内します。キオスク端末では Chrome を <code>--kiosk --autoplay-policy=no-user-gesture-required</code> で起動し、URL末尾に <code>&amp;autostart=1</code> を付けると無人で再生を始めます。</p>
        <button onClick={() => update(c => { c.devices.unshift({ id: rid(), name: '', key: crypto.randomUUID().replace(/-/g, ''), active: true, plan: 'internal', touch: true, mode: 'news' }); return c; })}>＋ 端末を追加</button>
      </div>
      {cfg.devices.map((d, i) => (
        <div key={d.id} className={`ad-card${d.active ? '' : ' is-off'}`}>
          <div className="ad-card-head">
            <span className="ad-type">📺 {d.name || '無題の端末'}</span>
            <label className="ad-toggle"><input type="checkbox" checked={d.active} onChange={e => set(i, { active: e.target.checked })} /> 有効</label>
            <button className="ad-del" onClick={() => confirm('削除しますか？') && update(c => { c.devices.splice(i, 1); return c; })}>削除</button>
          </div>
          <div className="ad-row">
            <Field label="設置場所・名前"><input value={d.name} onChange={e => set(i, { name: e.target.value })} placeholder="例：立川駅北口" /></Field>
            <Field label="地域名"><input value={d.region || ''} onChange={e => set(i, { region: e.target.value })} placeholder="例：立川" /></Field>
          </div>
          <div className="ad-row">
            <Field label="プラン">
              <select value={d.plan || 'internal'} onChange={e => set(i, { plan: e.target.value as Device['plan'] })}>
                <option value="internal">法人・自社（手動契約）</option>
                <option value="lite">ライト</option>
                <option value="standard">スタンダード</option>
              </select>
            </Field>
            <Field label="有効期限（空欄＝無期限）" hint={d.stripeSub ? 'Stripe の月額契約は自動で延長されます' : '請求書払いの場合はここで延長'}>
              <input type="date" value={d.paidUntil || ''} onChange={e => set(i, { paidUntil: e.target.value || undefined })} />
            </Field>
            <Field label="表示モード">
              <select value={d.mode || 'news'} onChange={e => set(i, { mode: e.target.value as Device['mode'] })}>
                <option value="news">ニュース</option><option value="mix">ミックス</option><option value="survey">アンケート専用</option><option value="quiz">クイズ専用</option>
              </select>
            </Field>
            <Field label="表示するアンケート">
              <select value={d.surveyId || ''} onChange={e => set(i, { surveyId: e.target.value || undefined })}>
                <option value="">なし</option>
                {cfg.surveys.filter(s => !s.owner || s.owner === d.id).map(s => <option key={s.id} value={s.id}>{s.title || '無題'}{s.active ? '' : '（非公開）'}</option>)}
              </select>
            </Field>
          </div>
          <label className="ad-toggle"><input type="checkbox" checked={d.touch !== false} onChange={e => set(i, { touch: e.target.checked })} /> タッチ操作できる画面</label>
          <div className="ad-row">
            <Field label="ローカル収集キーワード"><input value={list(d.localKeywords)} onChange={e => set(i, { localKeywords: e.target.value })} placeholder="立川, 昭島" /></Field>
            <Field label="追加RSS"><input value={list(d.localFeeds)} onChange={e => set(i, { localFeeds: e.target.value })} placeholder="https://…/rss.xml" /></Field>
          </div>
          {d.contact && <p className="ad-small">申込者：{d.contact}{d.stripeSub ? `（Stripe：${d.stripeSub}）` : ''}</p>}
          <Field label="サイネージURL（保存後に有効）">
            <input readOnly value={`${origin}/signage?device=${d.key}&autostart=1`} onFocus={e => e.target.select()} />
          </Field>
          <Field label="契約者用の設定URL（お客様に渡す）" hint="お客様がローカルニュース・アンケート・表示モードを自分で変更できます">
            {d.ownerKey
              ? <input readOnly value={`${origin}/signage/manage?k=${d.ownerKey}`} onFocus={e => e.target.select()} />
              : <button onClick={() => set(i, { ownerKey: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8) })}>設定URLを発行</button>}
          </Field>
        </div>
      ))}
    </section>
  );
}

// ---------------- プレミアム ----------------
function Premium({ cfg, update, api, origin }: Sub & { api: any; origin: string }) {
  const s = cfg.settings;
  const set = (patch: Partial<Settings>) => update(c => { c.settings = { ...c.settings, ...patch }; return c; });
  const [count, setCount] = useState(5);
  const [days, setDays] = useState(31);
  const [note, setNote] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const issue = async () => {
    setErr('');
    try { setCodes((await api('/api/admin/codes', { method: 'POST', body: JSON.stringify({ count, days, uses: 1, note }) })).codes); }
    catch (e: any) { setErr(e.message); }
  };
  return (
    <section>
      <div className="ad-card">
        <label className="ad-toggle"><input type="checkbox" checked={s.premiumEnabled} onChange={e => set({ premiumEnabled: e.target.checked })} /> プレミアムの案内を表示する</label>
        <Field label="Stripe 支払いリンク（Payment Link）"
          hint={`Stripe で支払いリンクを作り、「支払い後の動作」→「自分のウェブサイトにリダイレクト」に ${origin}/?premium_session={CHECKOUT_SESSION_ID} を設定。Workers に STRIPE_SECRET_KEY が必要です（現在：${cfg.features?.stripe ? '設定済み' : '未設定'}）`}>
          <input value={s.premiumLinkUrl || ''} onChange={e => set({ premiumLinkUrl: e.target.value })} placeholder="https://buy.stripe.com/..." />
        </Field>
        <div className="ad-row">
          <Field label="表示価格"><input value={s.premiumPrice || ''} onChange={e => set({ premiumPrice: e.target.value })} placeholder="月額 300円" /></Field>
          <Field label="単発購入の有効日数"><input type="number" min={1} max={366} value={s.premiumDays || 31} onChange={e => set({ premiumDays: parseInt(e.target.value, 10) })} /></Field>
        </div>
        <Field label="企業・自治体向け問い合わせ先（⋯メニューに表示）"><input value={s.contactUrl || ''} onChange={e => set({ contactUrl: e.target.value })} placeholder="https://forms.gle/… または mailto:…" /></Field>
      </div>
      <div className="ad-card">
        <h3>プレミアムコードを発行</h3>
        <p className="ad-small">キャンペーン・プレゼント・BOOTH等での販売用。1コード1回まで使えます。</p>
        <div className="ad-row">
          <Field label="枚数"><input type="number" min={1} max={100} value={count} onChange={e => setCount(parseInt(e.target.value, 10))} /></Field>
          <Field label="有効日数"><input type="number" min={1} max={366} value={days} onChange={e => setDays(parseInt(e.target.value, 10))} /></Field>
          <Field label="メモ"><input value={note} onChange={e => setNote(e.target.value)} placeholder="例：10月キャンペーン" /></Field>
        </div>
        <button onClick={issue}>発行する</button>
        {err && <p className="ad-msg">{err}</p>}
        {codes.length > 0 && <textarea readOnly rows={Math.min(10, codes.length)} value={codes.join('\n')} onFocus={e => e.target.select()} />}
      </div>
    </section>
  );
}

// ---------------- 集計 ----------------
function Stats({ cfg, api }: { cfg: Config; api: any }) {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<{ kind: string; ref: string; n: number }[]>([]);
  const [note, setNote] = useState('');
  useEffect(() => {
    api(`/api/admin/stats?days=${days}`).then((d: any) => { setRows(d.rows || []); setNote(d.note || ''); }).catch((e: any) => setNote(e.message));
  }, [days, api]);
  const nameOf = (ref: string) =>
    cfg.placements.find(p => p.id === ref)?.title || cfg.partners.find(p => p.id === ref)?.name || cfg.devices.find(d => d.id === ref)?.name || ref;
  const csv = () => {
    const text = ['種類,対象,回数', ...rows.map(r => `${KIND_LABEL[r.kind] || r.kind},"${nameOf(r.ref).replace(/"/g, '""')}",${r.n}`)].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
    a.download = `news-summoner-stats-${days}days.csv`;
    a.click();
  };
  return (
    <section>
      <div className="ad-row">
        <select value={days} onChange={e => setDays(parseInt(e.target.value, 10))}>
          {[7, 30, 90, 365].map(d => <option key={d} value={d}>直近{d}日</option>)}
        </select>
        <button onClick={csv} disabled={!rows.length}>CSVで保存（レポート用）</button>
      </div>
      {note && <p className="ad-msg">{note}</p>}
      <table className="ad-table">
        <thead><tr><th>種類</th><th>対象</th><th>回数</th></tr></thead>
        <tbody>
          {rows.map(r => <tr key={r.kind + r.ref}><td>{KIND_LABEL[r.kind] || r.kind}</td><td>{nameOf(r.ref)}</td><td>{r.n.toLocaleString()}</td></tr>)}
          {!rows.length && <tr><td colSpan={3}>まだデータがありません</td></tr>}
        </tbody>
      </table>
      <p className="ad-small">表示回数は1人1回の閲覧ごとに1回と数えます。</p>
    </section>
  );
}

// ---------------- サーベイ ----------------
function Surveys({ cfg, update, api, origin }: Sub & { api: any; origin: string }) {
  const [aggs, setAggs] = useState<Record<string, Agg>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [claim, setClaim] = useState<any>(null);
  const deviceName = (id?: string) => cfg.devices.find(d => d.id === id)?.name || id;

  const showResults = async (id: string) => {
    setOpen(o => (o === id ? null : id));
    if (!aggs[id]) setAggs(a => ({ ...a, [id]: { total: 0, q: {} } }));
    try { const d = await api(`/api/admin/survey/agg?id=${id}`); setAggs(a => ({ ...a, [id]: d })); } catch { /* noop */ }
  };
  const checkClaim = async (redeem: boolean) => {
    try { setClaim(await api(`/api/admin/claim?code=${encodeURIComponent(code.trim().toUpperCase())}`, { method: redeem ? 'POST' : 'GET' })); } catch (e: any) { setClaim({ valid: false, message: e.message }); }
  };

  return (
    <section>
      <div className="ad-intro">
        <p>タッチで答えるアンケートです（1つ選ぶ・複数・数字評価・マトリクス、条件分岐、回答特典・抽選）。「サイネージ」タブで端末の表示モードを「アンケート専用／ミックス」にして、表示するアンケートを選ぶと約1分で切り替わります。タッチできない端末にはQRコードが出て、スマホで回答できます。</p>
        <button onClick={() => update(c => { c.surveys.unshift(newSurvey()); return c; })}>＋ アンケートを作る</button>
      </div>
      {cfg.surveys.length === 0 && <p className="ad-empty">まだアンケートがありません</p>}
      {cfg.surveys.map((s, i) => (
        <div key={s.id}>
          {s.owner && <p className="ad-small">👤 契約者「{deviceName(s.owner)}」が作成</p>}
          <SurveyEditor survey={s}
            onChange={v => update(c => { c.surveys[i] = v; return c; })}
            onDelete={() => update(c => { c.surveys.splice(i, 1); return c; })} />
          <div className="ad-row ad-survey-tools">
            <button className="ad-sub" onClick={() => showResults(s.id)}>{open === s.id ? '集計を閉じる' : '📊 集計を見る'}</button>
            <input readOnly value={`${origin}/q?s=${s.id}`} onFocus={e => e.target.select()} title="スマホ回答用URL（Web・チラシのQRなど）" />
          </div>
          {open === s.id && <div className="ad-card"><SurveyResults survey={s} agg={aggs[s.id] || null} onExport={async () => (await api(`/api/admin/survey/export?id=${s.id}`)).rows} /></div>}
        </div>
      ))}
      <div className="ad-card">
        <h3>🎟 抽選の引換番号を確認</h3>
        <div className="ad-row">
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="例：A1B2C3" maxLength={10} />
          <button onClick={() => checkClaim(false)} disabled={!code}>確認</button>
        </div>
        {claim && (claim.valid ? (
          <div className={`ad-claim${claim.redeemed ? ' is-used' : ''}`}>
            <b>{claim.redeemed ? '⚠ 使用済み' : '✅ 有効'}</b> 景品：{claim.prize || '-'}／{new Date(claim.at).toLocaleString('ja-JP')}
            {!claim.redeemed && <button onClick={() => checkClaim(true)}>引き換え済みにする</button>}
          </div>
        ) : <p className="ad-msg">{claim.message || '見つかりません'}</p>)}
      </div>
    </section>
  );
}

// ---------------- 料金プラン・ローカル収集・クイズ ----------------
function SettingsTab({ cfg, update, api, origin, setMsg }: Sub & { api: any; origin: string; setMsg: (m: string) => void }) {
  const plans = cfg.settings.signagePlans || [];
  const topics = cfg.settings.localTopics || [];
  const setPlan = (i: number, patch: Partial<Plan>) => update(c => { c.settings.signagePlans![i] = { ...c.settings.signagePlans![i], ...patch }; return c; });
  const setTopic = (i: number, patch: Partial<Topic>) => update(c => { c.settings.localTopics![i] = { ...c.settings.localTopics![i], ...patch }; return c; });
  const run = async (path: string, done: string) => {
    setMsg('実行中…（数十秒かかることがあります）');
    try { const d = await api(path, { method: 'POST' }); setMsg(`${done}${d.pool !== undefined ? `（クイズの在庫：${d.pool}問）` : ''}`); } catch (e: any) { setMsg(e.message); }
  };
  return (
    <section>
      <div className="ad-card">
        <h3>📺 サイネージの料金プラン（LP と申し込みに使用）</h3>
        <p className="ad-small">
          Stripe で月額の支払いリンク（Payment Link）をプランごとに作り、「支払い後」のリダイレクト先に
          <code>{origin}/signage/start?session_id={'{CHECKOUT_SESSION_ID}'}</code> を設定してください。
          支払いが確認されると専用URLが自動で発行され、月額の継続も自動で確認します（Workers に STRIPE_SECRET_KEY が必要：{cfg.features?.stripe ? '設定済み' : '未設定'}）。
        </p>
        {plans.map((p, i) => (
          <div key={p.id} className="ad-plan">
            <div className="ad-row">
              <Field label={`プランID：${p.id}`}><input value={p.name} onChange={e => setPlan(i, { name: e.target.value })} /></Field>
              <Field label="月額（円・税込）"><input type="number" min={0} value={p.price} onChange={e => setPlan(i, { price: parseInt(e.target.value, 10) || 0 })} /></Field>
              <Field label="Stripe 支払いリンク"><input value={p.linkUrl || ''} onChange={e => setPlan(i, { linkUrl: e.target.value })} placeholder="https://buy.stripe.com/..." /></Field>
            </div>
            <Field label="できること（1行に1つ）"><textarea rows={4} value={Array.isArray(p.features) ? p.features.join('\n') : p.features} onChange={e => setPlan(i, { features: e.target.value })} /></Field>
            <label className="ad-toggle"><input type="checkbox" checked={!!p.recommended} onChange={e => setPlan(i, { recommended: e.target.checked })} /> おすすめ表示</label>
          </div>
        ))}
      </div>

      <div className="ad-card">
        <div className="ad-card-head">
          <span className="ad-type">🔎 地域ごとのローカルニュース収集</span>
          <button onClick={() => update(c => { c.settings.localTopics = [{ id: rid(), region: '', keywords: [], feeds: [] }, ...(c.settings.localTopics || [])]; return c; })}>＋ 地域を追加</button>
        </div>
        <p className="ad-small">キーワードを含むニュースを、配信中の全ジャンルのニュースと追加RSS（市役所・観光協会の新着情報など）から集めます。同じ地域名のサイネージと、メイン画面の <code>/?local=地域名</code> に表示されます。Google ニュース等は規約・robots.txt で収集が禁止されているため使っていません。</p>
        {topics.map((t, i) => (
          <div key={t.id} className="ad-row ad-topic">
            <Field label="地域名"><input value={t.region} onChange={e => setTopic(i, { region: e.target.value })} placeholder="立川" /></Field>
            <Field label="キーワード（カンマ区切り）"><input value={list(t.keywords)} onChange={e => setTopic(i, { keywords: e.target.value })} placeholder="立川, 昭和記念公園" /></Field>
            <Field label="追加RSS（カンマ区切り）"><input value={list(t.feeds)} onChange={e => setTopic(i, { feeds: e.target.value })} placeholder="https://…" /></Field>
            <button className="ad-del" onClick={() => update(c => { c.settings.localTopics!.splice(i, 1); return c; })}>削除</button>
          </div>
        ))}
        <button className="ad-sub" onClick={() => run('/api/admin/local/crawl', 'ローカルニュースを収集しました')}>今すぐ収集する（保存後に実行）</button>
      </div>

      <div className="ad-card">
        <h3>🎮 ニュースクイズ</h3>
        <p className="ad-small">ニュースが更新されるたび（1日2回）に、AIが記事から4択クイズを自動で作ります（最大300問を入れ替え）。足りないときはジャンル当てクイズで補うので、問題が尽きることはありません。</p>
        <button className="ad-sub" onClick={() => run('/api/admin/quiz/generate', 'クイズを追加しました')}>今すぐクイズを追加する</button>
      </div>
    </section>
  );
}
