'use client';

// 管理画面：掲載枠（スポンサー／ローカル）・提携メディア・サイネージ端末・プレミアム・集計
// ログインには Workers に設定した ADMIN_TOKEN を使う（ブラウザのタブを閉じると消える）

import React, { useCallback, useEffect, useState } from 'react';
import Script from 'next/script';
import { API_BASE } from '../lib/api';

type Placement = {
  id: string; type: 'sponsor' | 'local'; active: boolean; title: string; sponsor: string; description: string;
  glbUrl: string; linkUrl?: string; linkLabel?: string; keywords?: string[] | string; region?: string;
  realScale?: boolean; startAt?: string; endAt?: string;
};
type Partner = { id: string; name: string; domains: string[] | string; active: boolean; plan?: string; note?: string };
type Device = { id: string; name: string; key: string; active: boolean; region?: string };
type Settings = { premiumEnabled: boolean; premiumLinkUrl?: string; premiumPrice?: string; premiumDays?: number; contactUrl?: string };
type Config = { placements: Placement[]; partners: Partner[]; devices: Device[]; settings: Settings; features?: { stats: boolean; assets: boolean; stripe: boolean } };
type Tab = 'placements' | 'partners' | 'devices' | 'premium' | 'stats';

const KIND_LABEL: Record<string, string> = {
  sponsor_impression: 'スポンサー表示', sponsor_open: 'スポンサー3D表示', sponsor_link: 'スポンサーリンク',
  local_impression: 'ローカル表示', local_open: 'ローカル3D表示', local_link: 'ローカルリンク',
  photo: 'AR写真', embed_view: 'ウィジェット表示', embed_play: 'ウィジェット再生',
  signage_play: 'サイネージ再生', signage_talk: 'サイネージ会話', premium_activate: 'プレミアム有効化'
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
    api('/api/admin/config').then(d => { setCfg(d); setDirty(false); }).catch(e => setMsg(e.message));
  }, [token, api]);

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
      const saved = await api('/api/admin/config', { method: 'PUT', body: JSON.stringify(cfg) });
      setCfg(c => ({ ...saved, features: c?.features }));
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
          {([['placements', '🎁 3D掲載枠'], ['partners', '🤝 提携メディア'], ['devices', '📺 サイネージ'], ['premium', '⭐ プレミアム'], ['stats', '📊 集計']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
        <div className="ad-save">
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
          {tab === 'premium' && <Premium cfg={cfg} update={update} api={api} origin={origin} />}
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
        <button onClick={() => update(c => { c.devices.unshift({ id: rid(), name: '', key: crypto.randomUUID().replace(/-/g, ''), active: true }); return c; })}>＋ 端末を追加</button>
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
          <Field label="サイネージURL（保存後に有効）">
            <input readOnly value={`${origin}/signage?device=${d.key}&autostart=1`} onFocus={e => e.target.select()} />
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
