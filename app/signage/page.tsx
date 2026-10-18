'use client';

// デジタルサイネージ：/signage?device=端末キー（&autostart=1 で無人起動）
// - 20秒ごとに設定を確認し、管理画面・契約者画面での変更（ニュース／アンケート／クイズ／ミックス）をすぐ反映
// - 契約が切れている端末は表示を止める（キーなしはデモ表示）
// - タッチできない画面では、QRコードからスマホで参加してもらう（アンケート・クイズ・会話）

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useSearchParams } from 'next/navigation';
import SurveyRunner from '../components/SurveyRunner';
import QuizGame from '../components/QuizGame';
import { API_BASE, fetchConfig, Placement, track } from '../lib/api';
import { getRecognition, pickJapaneseVoice, recognitionSupported, splitSentences, startTalk, stopTalk, TalkHolder } from '../lib/speech';
import { SubmitResult } from '../lib/survey';
import { getAdminSession } from '../lib/adminSession';

const AVATAR_SRC = '/models/RobotExpressive.glb';
const ANIM = { idle: 'Idle', talk: 'Yes', wave: 'Wave', think: 'Standing' };
const LABELS: Record<string, string> = {
  it: 'IT', business: 'ビジネス', entertainment: 'エンタメ', funny: 'オモシロ', politics: '政治', society: '社会',
  world: '国際', sports: 'スポーツ', science: '科学', lifestyle: '暮らし', local: 'ローカル'
};
const PLACEMENT_EVERY = 3; // ニュース何本ごとに3D枠をはさむか
const INVITE_EVERY = 4; // ミックスモード：何本ごとにアンケート／クイズの案内をはさむか
const IDLE_RESET_SEC = 90; // タッチ操作が止まってから元の表示に戻るまで

type Item = { title: string; url: string; summary?: string; source?: string };
type Slide =
  | { kind: 'news'; cat: string; item: Item }
  | { kind: 'placement'; p: Placement }
  | { kind: 'invite'; what: 'survey' | 'quiz' };
type Turn = { role: 'user' | 'assistant'; content: string };
type State = {
  active: boolean;
  reason?: string;
  rev?: string;
  device?: { id: string; name: string; region?: string; touch: boolean; mode: 'news' | 'survey' | 'quiz' | 'mix'; plan: string };
  features?: { survey: boolean; quiz: boolean; talk: boolean };
  survey?: any;
  localItems?: { id: string; title: string; description: string; linkUrl?: string }[];
  localNews?: Item[];
  preview?: boolean;
  surveys?: { id: string; title: string; active: boolean }[];
  regions?: string[];
};
type Preview = { mode: 'news' | 'survey' | 'quiz' | 'mix'; touch: boolean; survey: string; region: string };

const qr = (data: string, size = 220) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=1&data=${encodeURIComponent(data)}`;

// 管理者プレビューの状態を作る。既存の管理API（/api/admin/config）だけで組み立てるので、
// サーバーの新しいプレビューAPIがまだデプロイされていなくても表示できる
async function buildPreviewState(token: string, p: Preview): Promise<State> {
  const r = await fetch(`${API_BASE}/api/admin/config`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401) return { active: false, reason: 'admin' };
  if (!r.ok) throw new Error(`config ${r.status}`);
  const cfg = await r.json();
  const surveys: any[] = Array.isArray(cfg.surveys) ? cfg.surveys : [];
  const picked = surveys.find(s => s.id === p.survey) || surveys.find(s => s.active) || surveys[0] || null;
  // 回答者に見せない情報（クーポンコード・当選確率）は外す
  const survey = picked ? { ...picked, incentive: { type: picked.incentive?.type || 'none', text: picked.incentive?.text } } : null;
  const regions = [...new Set([
    ...((cfg.settings?.localTopics || []) as any[]).map(t => t.region),
    ...((cfg.devices || []) as any[]).map(d => d.region)
  ].filter(Boolean))] as string[];
  let localNews: Item[] = [];
  try {
    const lr = await fetch(`${API_BASE}/api/local?region=${encodeURIComponent(p.region)}`);
    if (lr.ok) localNews = ((await lr.json()).items || []) as Item[];
  } catch { /* ローカル収集APIが未デプロイなら空のまま */ }
  return {
    active: true,
    preview: true,
    rev: `${cfg.rev || ''}|${p.mode}|${p.touch}|${survey?.id || ''}|${p.region}`,
    device: { id: 'preview', name: '管理者プレビュー', region: p.region || undefined, touch: p.touch, mode: p.mode, plan: 'internal' },
    features: { survey: true, quiz: true, talk: true },
    survey,
    surveys: surveys.map(s => ({ id: s.id, title: s.title, active: !!s.active })),
    regions,
    localItems: [],
    localNews
  };
}

function SignageInner() {
  const params = useSearchParams();
  const deviceKey = params.get('device') || '';
  const autostart = params.get('autostart') === '1';
  // 管理者プレビュー：/signage?preview=1（管理画面でログインしていれば、契約なしで全モードを確認できる）
  const preview = params.get('preview') === '1';
  const demo = !deviceKey && !preview;

  const [started, setStarted] = useState(autostart);
  const [pv, setPv] = useState<Preview>({ mode: 'mix', touch: true, survey: '', region: '' });
  const [pvOpen, setPvOpen] = useState(true);
  const pvRef = useRef(pv);
  pvRef.current = pv;
  const [state, setState] = useState<State | null>(demo ? { active: true, device: { id: 'demo', name: 'デモ', touch: true, mode: 'news', plan: 'demo' }, features: { survey: false, quiz: true, talk: false } } : null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [slide, setSlide] = useState<Slide | null>(null);
  const [sentences, setSentences] = useState<string[]>([]);
  const [seg, setSeg] = useState(-1);
  const [anim, setAnim] = useState(ANIM.idle);
  const [overlay, setOverlay] = useState<'none' | 'survey' | 'quiz' | 'talk'>('none');
  const [talkMode, setTalkMode] = useState<'listening' | 'thinking' | 'answering'>('answering');
  const [heard, setHeard] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [live, setLive] = useState<{ total: number; q: Record<string, any> } | null>(null);
  const [now, setNow] = useState(new Date());
  const [origin, setOrigin] = useState('');

  const talkRef = useRef<TalkHolder>({ session: null, timer: null, utterances: [] });
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const idxRef = useRef(0);
  const slidesRef = useRef<Slide[]>([]);
  const overlayRef = useRef(overlay);
  const stateRef = useRef<State | null>(state);
  const loopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewerRef = useRef<any>(null);
  const recRef = useRef<any>(null);
  const silenceRef = useRef(0);
  const turnsRef = useRef<Turn[]>([]);
  const slideRef = useRef<Slide | null>(null);
  const newsRef = useRef<any>(null);
  const placementsRef = useRef<Placement[]>([]);
  slidesRef.current = slides;
  overlayRef.current = overlay;
  stateRef.current = state;
  turnsRef.current = turns;
  slideRef.current = slide;

  const touch = state?.device?.touch !== false;
  const mode = state?.device?.mode || 'news';
  const features = state?.features || { survey: false, quiz: true, talk: false };
  const survey = features.survey ? state?.survey : null;
  const scope = state?.device?.id && !demo ? state.device.id : 'web';
  const surveyUrl = survey ? `${origin}/q?s=${survey.id}&d=${deviceKey}` : '';
  const playUrl = `${origin}/play?scope=${scope}`;

  // ---------- 端末の状態（20秒ごと） ----------
  const fetchState = useCallback(async () => {
    if (demo) return;
    try {
      let d: State;
      if (preview) {
        const token = getAdminSession();
        if (!token) { setState({ active: false, reason: 'admin' }); return; }
        d = await buildPreviewState(token, pvRef.current);
      } else {
        d = await fetch(`${API_BASE}/api/signage/state?device=${encodeURIComponent(deviceKey)}`).then(r => r.json());
      }
      setState(prev => (prev && prev.rev === d.rev && JSON.stringify(prev) === JSON.stringify(d) ? prev : d));
    } catch { /* 通信が戻ったら再取得 */ }
  }, [demo, deviceKey, preview]);

  // プレビューの設定を変えたらすぐ取り直す
  useEffect(() => { if (preview) fetchState(); }, [pv, preview, fetchState]);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetchState();
    const t = setInterval(fetchState, 20_000);
    const c = setInterval(() => setNow(new Date()), 30_000);
    // 長時間つけっぱなしの端末は6時間ごとに再読み込み（新しい機能・メモリ対策）
    const r = setTimeout(() => window.location.reload(), 6 * 3600_000);
    const loadVoice = () => { voiceRef.current = pickJapaneseVoice(); };
    loadVoice();
    window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoice);
    // 画面が暗くならないようにする
    let lock: any = null;
    const keepAwake = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* 非対応 */ } };
    keepAwake();
    document.addEventListener('visibilitychange', keepAwake);
    const talk = talkRef.current;
    return () => { clearInterval(t); clearInterval(c); clearTimeout(r); stopTalk(talk); lock?.release?.(); document.removeEventListener('visibilitychange', keepAwake); };
  }, [fetchState]);

  // ---------- ニュース・掲載枠の読み込み（30分ごと） ----------
  useEffect(() => {
    const load = async () => {
      const [cfg, news] = await Promise.all([fetchConfig(), fetch(`${API_BASE}/api/news`).then(r => r.json()).catch(() => null)]);
      newsRef.current = news;
      placementsRef.current = cfg.placements;
      buildSlides();
    };
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 表示する順番を組み立てる（ローカル → ニュース、間に3D枠・案内）
  const buildSlides = useCallback(() => {
    const st = stateRef.current;
    const news = newsRef.current;
    const local: Slide[] = [
      ...(st?.localItems || []).map(i => ({ kind: 'news' as const, cat: 'local', item: { title: i.title, url: i.linkUrl || '', summary: i.description, source: st?.device?.name } })),
      ...(st?.localNews || []).filter(i => i.summary).slice(0, 6).map(item => ({ kind: 'news' as const, cat: 'local', item }))
    ];
    const newsSlides: Slide[] = [];
    if (news) for (const cat of Object.keys(news)) {
      if (!Array.isArray(news[cat])) continue;
      news[cat].filter((i: Item) => i.summary).slice(0, 2).forEach((item: Item) => newsSlides.push({ kind: 'news', cat, item }));
    }
    const pls = [...placementsRef.current].sort((a, b) => (a.type === b.type ? 0 : a.type === 'local' ? -1 : 1))
      .filter(p => p.type === 'sponsor' || !st?.device?.region || !p.region || p.region === st.device.region);
    const invites: Slide[] = [];
    if (st?.device?.mode === 'mix') {
      if (st.features?.survey && st.survey) invites.push({ kind: 'invite', what: 'survey' });
      invites.push({ kind: 'invite', what: 'quiz' });
    }
    const out: Slide[] = [];
    let pi = 0;
    let ii = 0;
    [...local, ...newsSlides].forEach((s, i) => {
      out.push(s);
      if (pls.length && (i + 1) % PLACEMENT_EVERY === 0) out.push({ kind: 'placement', p: pls[pi++ % pls.length] });
      if (invites.length && (i + 1) % INVITE_EVERY === 0) out.push(invites[ii++ % invites.length]);
    });
    if (!out.length) pls.forEach(p => out.push({ kind: 'placement', p }));
    setSlides(out);
  }, []);

  // 設定が変わったら並びを作り直し、表示中のオーバーレイも見直す
  useEffect(() => { buildSlides(); }, [state?.rev, state?.localNews?.length, buildSlides]);

  useEffect(() => {
    const mv = viewerRef.current;
    if (mv?.play) try { mv.play(); } catch { /* noop */ }
  }, [anim, slide]);

  // ---------- 読み上げ ----------
  const say = useCallback((lines: { text: string; seg: number }[], onDone: () => void) => {
    setSeg(-1);
    setAnim(ANIM.talk);
    const talk = startTalk(talkRef.current, { muted: false, voice: voiceRef.current, onSeg: setSeg, onDone: () => { setAnim(ANIM.idle); onDone(); } });
    lines.forEach(l => talk.enqueue(l.text, l.seg));
    talk.ready(lines.reduce((n, l) => n + l.text.length, 0));
  }, []);

  const playNext = useCallback(() => {
    if (overlayRef.current !== 'none') return;
    const m = stateRef.current?.device?.mode || 'news';
    if (m === 'survey' || m === 'quiz') return; // 専用モードは下の画面が担当
    const list = slidesRef.current;
    if (!list.length) { loopTimer.current = setTimeout(playNext, 5000); return; }
    const s = list[idxRef.current % list.length];
    idxRef.current++;
    setSlide(s);
    const next = () => { loopTimer.current = setTimeout(playNext, 1500); };
    if (s.kind === 'news') {
      const ss = splitSentences(s.item.summary || '');
      setSentences(ss);
      if (!stateRef.current?.preview) track('signage_play', stateRef.current?.device?.id || 'demo');
      say([{ text: `${LABELS[s.cat] || s.cat}のニュースです。${s.item.title}。`, seg: -1 }, ...ss.map((text, i) => ({ text, seg: i }))], next);
    } else if (s.kind === 'placement') {
      const ss = splitSentences(s.p.description);
      setSentences(ss);
      if (!stateRef.current?.preview) track(s.p.type === 'sponsor' ? 'sponsor_impression' : 'local_impression', s.p.id, false);
      const intro = s.p.type === 'sponsor' ? `ここで、${s.p.sponsor}からのお知らせです。` : `${s.p.region || ''}の見どころ、${s.p.title}をご紹介します。`;
      say([{ text: intro, seg: -1 }, ...ss.map((text, i) => ({ text, seg: i }))], () => { loopTimer.current = setTimeout(next, 6000); });
    } else {
      const sv = stateRef.current?.survey;
      const touchable = stateRef.current?.device?.touch !== false;
      const text = s.what === 'survey'
        ? `${touchable ? '画面をタッチして' : 'QRコードから'}アンケートにご協力ください。${sv?.incentive?.text ? `回答すると${sv.incentive.type === 'lottery' ? '抽選で' : ''}${sv.incentive.text}がもらえます。` : ''}`
        : `${touchable ? '画面をタッチして' : 'スマホでQRコードを読み取って'}、ニュースクイズに挑戦してね。今日のランキング1位をめざそう！`;
      setSentences([text]);
      say([{ text, seg: 0 }], () => { loopTimer.current = setTimeout(next, 9000); });
    }
  }, [say]);

  useEffect(() => {
    if (!started || !state?.active) return;
    if ((mode === 'news' || mode === 'mix') && overlay === 'none' && slides.length && !loopTimer.current && !talkRef.current.session) playNext();
  }, [started, state?.active, mode, overlay, slides.length, playNext]);

  // モードが変わったら読み上げを止めて切り替える
  useEffect(() => {
    if (loopTimer.current) { clearTimeout(loopTimer.current); loopTimer.current = null; }
    stopTalk(talkRef.current);
    setOverlay('none');
    setSlide(null);
    if (started && (mode === 'survey') && survey) {
      const text = `${survey.title}。${touch ? '画面をタッチして' : 'QRコードを読み取って'}ご協力ください。`;
      setSentences([text]);
      say([{ text, seg: 0 }], () => {});
    } else if (started && stateRef.current?.active && (mode === 'news' || mode === 'mix')) {
      // ニュース／ミックスに切り替わったら、読み上げを最初から再開する
      loopTimer.current = setTimeout(() => { loopTimer.current = null; playNext(); }, 400);
    }
  }, [mode, survey?.id, started]); // eslint-disable-line react-hooks/exhaustive-deps

  // アンケートのライブ集計（タッチできない画面で表示）
  useEffect(() => {
    if (!survey || (touch && mode !== 'survey')) { setLive(null); return; }
    const get = () => fetch(`${API_BASE}/api/survey/live?id=${survey.id}`).then(r => r.json()).then(setLive).catch(() => {});
    get();
    const t = setInterval(get, 20_000);
    return () => clearInterval(t);
  }, [survey?.id, touch, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- タッチ操作（オーバーレイ） ----------
  const bumpIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => { closeOverlayRef.current(); }, IDLE_RESET_SEC * 1000);
  }, []);

  const openOverlay = (what: 'survey' | 'quiz') => {
    if (loopTimer.current) { clearTimeout(loopTimer.current); loopTimer.current = null; }
    stopTalk(talkRef.current);
    setAnim(ANIM.wave);
    setOverlay(what);
    bumpIdle();
  };

  const closeOverlay = useCallback(() => {
    try { recRef.current?.abort(); } catch { /* noop */ }
    stopTalk(talkRef.current);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setOverlay('none');
    setTurns([]);
    setHeard('');
    setAnim(ANIM.idle);
    loopTimer.current = null;
    setTimeout(() => { if (overlayRef.current === 'none') playNext(); }, 600);
  }, [playNext]);
  const closeOverlayRef = useRef(closeOverlay);
  closeOverlayRef.current = closeOverlay;

  const submitSurvey = async (answers: Record<string, any>): Promise<SubmitResult> => {
    const r = await fetch(`${API_BASE}/api/survey/submit`, { method: 'POST', body: JSON.stringify({ id: survey.id, answers, device: deviceKey }) });
    const d = await r.json();
    return r.ok ? d : { error: d?.error || '送信できませんでした' };
  };

  // ---------- 音声会話 ----------
  const listen = useCallback(() => {
    const rec = getRecognition();
    if (!rec) return;
    try { recRef.current?.abort(); } catch { /* noop */ }
    setTalkMode('listening');
    setHeard('');
    setAnim(ANIM.idle);
    bumpIdle();
    let finalText = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
      }
      setHeard(finalText + interim);
    };
    rec.onend = () => {
      if (overlayRef.current !== 'talk') return;
      const q = finalText.trim();
      if (!q) {
        silenceRef.current++;
        if (silenceRef.current >= 2) { silenceRef.current = 0; closeOverlayRef.current(); } else listenRef.current();
        return;
      }
      silenceRef.current = 0;
      answerRef.current(q);
    };
    recRef.current = rec;
    try { rec.start(); } catch { closeOverlayRef.current(); }
  }, [bumpIdle]);

  const answer = async (q: string) => {
    setTalkMode('thinking');
    setAnim(ANIM.think);
    const history = turnsRef.current.slice(-6);
    setTurns(t => [...t, { role: 'user', content: q }]);
    let a = '';
    try {
      const cur = slideRef.current;
      const res = await fetch(`${API_BASE}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history, device: deviceKey || undefined, url: cur?.kind === 'news' ? cur.item.url : undefined, placement: cur?.kind === 'placement' ? cur.p.id : undefined })
      });
      a = (await res.json())?.answer || '';
    } catch { /* noop */ }
    if (!a) a = 'ごめんなさい、うまく聞き取れなかったみたいです。もう一度話しかけてね。';
    setTurns(t => [...t, { role: 'assistant', content: a }]);
    setTalkMode('answering');
    const ss = splitSentences(a);
    setSentences(ss);
    say(ss.map((text, i) => ({ text, seg: i })), () => { if (overlayRef.current === 'talk') listenRef.current(); });
  };
  const listenRef = useRef(listen);
  listenRef.current = listen;
  const answerRef = useRef(answer);
  answerRef.current = answer;

  const startTalkMode = () => {
    if (loopTimer.current) { clearTimeout(loopTimer.current); loopTimer.current = null; }
    stopTalk(talkRef.current);
    silenceRef.current = 0;
    setTurns([]);
    setOverlay('talk');
    setTalkMode('answering');
    const greet = 'はーい！なんでも話しかけてね。';
    setSentences([greet]);
    say([{ text: greet, seg: 0 }], () => listenRef.current());
  };

  // ---------- 表示 ----------
  if (state && !state.active) {
    return (
      <div className="sg-root sg-blocked">
        <div>
          <div className="sg-logo">🔮 News Summoner</div>
          <h1>{state.reason === 'admin' ? '管理者としてログインしてください' : state.reason === 'expired' ? 'ご契約の有効期限が切れています' : 'このサイネージURLは無効です'}</h1>
          {state.reason === 'admin' && <p><a className="sg-btn sg-btn-sub" href="/admin">管理画面でログインする</a></p>}
          <p>{state.reason === 'admin' ? 'プレビューは管理者だけが使えます。ログイン後にこのページを再読み込みしてください。' : state.reason === 'expired' ? 'お支払い（お振込み）を確認でき次第、表示を再開します。' : '管理画面で発行されたURLをご確認ください。'}</p>
        </div>
      </div>
    );
  }

  const canTalk = touch && features.talk && typeof window !== 'undefined' && recognitionSupported();
  const p = slide?.kind === 'placement' ? slide.p : null;
  const lastAnswer = [...turns].reverse().find(t => t.role === 'assistant');
  const lastQ = [...turns].reverse().find(t => t.role === 'user');
  const firstChoiceQ = survey?.questions?.find((q: any) => q.type === 'single' || q.type === 'scale');

  const stage = (
    <section className="sg-stage">
      <model-viewer
        ref={viewerRef}
        src={p ? p.glbUrl : AVATAR_SRC}
        alt={p ? p.title : 'アバター'}
        autoplay=""
        auto-rotate={p ? '' : undefined}
        camera-orbit={p ? undefined : '0deg 80deg 14m'}
        camera-target={p ? undefined : '0m 2.3m 0m'}
        field-of-view={p ? undefined : '30deg'}
        animation-name={p ? undefined : anim}
        animation-crossfade-duration="300"
        shadow-intensity="1"
        exposure="1.1"
        interaction-prompt="none"
      />
      {p && (
        <div className="sg-sponsor">
          {p.type === 'sponsor' ? <><span className="ns-pr">PR</span> 提供：{p.sponsor}</> : <>📍 {p.region || p.sponsor}</>}
        </div>
      )}
    </section>
  );

  const reading = (list: string[]) => <p className="sg-text">{list.map((t, i) => <span key={i} className={seg === i ? 'is-reading' : undefined}>{t}</span>)}</p>;

  // 専用モード：アンケート
  const surveyScreen = survey && (touch ? (
    <section className="sg-panel sg-survey" onPointerDown={bumpIdle}>
      <SurveyRunner key={survey.id} survey={survey} onSubmit={submitSurvey} big resetAfter={12} />
    </section>
  ) : (
    <section className="sg-panel">
      <div className="sg-bubble">
        <div className="sg-label">📝 アンケートにご協力ください</div>
        <div className="sg-title">{survey.title}</div>
        {survey.incentive?.text && <div className="sg-incentive">🎁 回答すると{survey.incentive.type === 'lottery' ? '抽選で' : ''}「{survey.incentive.text}」</div>}
        {live && firstChoiceQ && <LiveBars q={firstChoiceQ} agg={live} />}
        <div className="sg-count">これまでに <b>{(live?.total || 0).toLocaleString()}</b> 人が回答</div>
      </div>
      <div className="sg-qr-big">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr(surveyUrl, 360)} alt="アンケートのQRコード" />
        <span>スマホのカメラで読み取って回答（約1分）</span>
      </div>
    </section>
  ));

  // 専用モード：クイズ
  const quizScreen = (
    <section className="sg-panel sg-quiz" onPointerDown={bumpIdle}>
      <QuizGame scope={scope} mode={touch ? 'play' : 'auto'} big kiosk
        onSpeak={touch ? undefined : text => say([{ text, seg: 0 }], () => {})} />
      {!touch && (
        <div className="sg-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr(playUrl)} alt="クイズのQRコード" />
          <span>スマホで参加・ランキング登録</span>
        </div>
      )}
    </section>
  );

  let panel: React.ReactNode;
  if (overlay === 'survey' && survey) panel = surveyScreen;
  else if (overlay === 'quiz') panel = quizScreen;
  else if (mode === 'survey' && survey) panel = surveyScreen;
  else if (mode === 'quiz') panel = quizScreen;
  else if (overlay === 'talk') {
    panel = (
      <section className="sg-panel">
        <div className="sg-bubble">
          <div className="sg-label">💬 おしゃべり中</div>
          {lastQ && <div className="sg-q">「{lastQ.content}」</div>}
          {talkMode === 'listening' && <div className="sg-listen">🎤 聞いています… {heard && <span>{heard}</span>}</div>}
          {talkMode === 'thinking' && <div className="sg-listen">考えています…</div>}
          {talkMode === 'answering' && reading(lastAnswer ? splitSentences(lastAnswer.content) : sentences)}
          <button className="sg-btn sg-btn-sub" onClick={e => { e.stopPropagation(); closeOverlay(); }}>ニュースに戻る</button>
        </div>
      </section>
    );
  } else {
    const inv = slide?.kind === 'invite' ? slide.what : null;
    panel = (
      <section className="sg-panel">
        {slide ? (
          <div className="sg-bubble">
            <div className="sg-label">
              {slide.kind === 'news' ? `${LABELS[slide.cat] || slide.cat}のニュース`
                : slide.kind === 'placement' ? (slide.p.type === 'sponsor' ? 'スポンサーからのお知らせ' : '地域のおすすめ')
                : inv === 'survey' ? '📝 アンケート' : '🎮 ニュースクイズ'}
            </div>
            <div className={`sg-title${seg === -1 ? ' is-reading' : ''}`}>
              {slide.kind === 'news' ? slide.item.title : slide.kind === 'placement' ? slide.p.title : inv === 'survey' ? survey?.title : '今日のニュースから出題！'}
            </div>
            {reading(sentences)}
            {slide.kind === 'news' && slide.item.source && <div className="sg-source">出典：{slide.item.source}</div>}
            {inv && !touch && (
              <div className="sg-qr-inline">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr(inv === 'survey' ? surveyUrl : playUrl, 260)} alt="QRコード" />
                <span>スマホで読み取って参加</span>
              </div>
            )}
            {inv && touch && (
              <button className="sg-btn" onClick={e => { e.stopPropagation(); openOverlay(inv); }}>{inv === 'survey' ? '📝 回答する' : '🎮 あそぶ'}</button>
            )}
          </div>
        ) : (
          <div className="sg-bubble"><div className="sg-title">ニュースを準備しています…</div></div>
        )}

        <div className="sg-bottom">
          {touch && (
            <div className="sg-actions">
              {canTalk && <button className="sg-btn" onClick={e => { e.stopPropagation(); startTalkMode(); }}>🎤 話しかけてね</button>}
              {mode === 'mix' && survey && <button className="sg-btn sg-btn-alt" onClick={e => { e.stopPropagation(); openOverlay('survey'); }}>📝 アンケート</button>}
              {(mode === 'mix' || demo) && features.quiz && <button className="sg-btn sg-btn-alt" onClick={e => { e.stopPropagation(); openOverlay('quiz'); }}>🎮 クイズ</button>}
            </div>
          )}
          {origin && (
            <div className="sg-qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr(p?.linkUrl || (touch ? `${origin}/` : survey && mode === 'mix' ? surveyUrl : playUrl))} alt="QRコード" />
              <span>{p?.linkUrl ? '詳しくはこちら' : touch ? 'スマホで続きを見る' : survey && mode === 'mix' ? 'スマホでアンケート' : 'スマホでクイズ'}</span>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className={`sg-root${touch ? '' : ' sg-notouch'}${preview ? ' sg-preview' : ''}`} onClick={() => !started && setStarted(true)}>
      <Script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js" />
      <header className="sg-head">
        <div className="sg-logo">🔮 News Summoner{demo && <small className="sg-demo">デモ表示</small>}{preview && <small className="sg-demo">管理者プレビュー</small>}</div>
        <div className="sg-head-right">
          {(overlay === 'survey' || overlay === 'quiz') && <button className="sg-btn sg-btn-sub" onClick={closeOverlay}>✕ 閉じる</button>}
          <div className="sg-clock">
            {now.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}{' '}
            {now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </header>
      <main className="sg-main">{stage}{panel}</main>
      {preview && (
        <div className={`sg-pv${pvOpen ? '' : ' is-closed'}`} onClick={e => e.stopPropagation()}>
          <button className="sg-pv-toggle" onClick={() => setPvOpen(o => !o)}>{pvOpen ? '× 閉じる' : '⚙ プレビュー設定'}</button>
          {pvOpen && (
            <>
              <b>👑 管理者プレビュー</b>
              <label>表示モード
                <select value={pv.mode} onChange={e => setPv(p => ({ ...p, mode: e.target.value as Preview['mode'] }))}>
                  <option value="news">ニュース</option><option value="mix">ミックス</option><option value="survey">アンケート専用</option><option value="quiz">クイズ専用</option>
                </select>
              </label>
              <label className="sg-pv-check"><input type="checkbox" checked={pv.touch} onChange={e => setPv(p => ({ ...p, touch: e.target.checked }))} /> タッチ操作できる画面</label>
              <label>アンケート
                <select value={pv.survey} onChange={e => setPv(p => ({ ...p, survey: e.target.value }))}>
                  <option value="">（公開中の最初のもの）</option>
                  {(state?.surveys || []).map(s => <option key={s.id} value={s.id}>{s.title}{s.active ? '' : '（非公開）'}</option>)}
                </select>
              </label>
              <label>地域（ローカルニュース）
                <select value={pv.region} onChange={e => setPv(p => ({ ...p, region: e.target.value }))}>
                  <option value="">すべて</option>
                  {(state?.regions || []).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <small>このプレビューは集計・課金の対象外です</small>
            </>
          )}
        </div>
      )}
      {!started && (
        <div className="sg-start">
          <div>🔮</div>
          <div>{touch ? '画面をタッチして開始' : 'クリックして開始'}</div>
          <small>音声が流れます（無人で始める場合は URL の末尾に &amp;autostart=1）</small>
        </div>
      )}
    </div>
  );
}

// タッチできない画面向け：最初の選択式の設問の「みんなの回答」
function LiveBars({ q, agg }: { q: any; agg: { total: number; q: Record<string, any> } }) {
  const a = agg.q?.[q.id] || {};
  const items: { label: string; n: number }[] = q.type === 'single'
    ? (q.options || []).map((o: any) => ({ label: o.label, n: a[o.id] || 0 }))
    : Array.from({ length: (q.max ?? 5) - (q.min ?? 1) + 1 }, (_, i) => ({ label: String((q.min ?? 1) + i), n: a[String((q.min ?? 1) + i)] || 0 }));
  const total = items.reduce((s, x) => s + x.n, 0);
  return (
    <div className="sg-live">
      <div className="sg-live-q">みんなの回答：{q.text}</div>
      {items.map(it => (
        <div key={it.label} className="sg-live-row">
          <span>{it.label}</span>
          <i><b style={{ width: `${total ? (it.n / total) * 100 : 0}%` }} /></i>
          <em>{total ? Math.round((it.n / total) * 100) : 0}%</em>
        </div>
      ))}
    </div>
  );
}

export default function SignagePage() {
  return (
    <Suspense fallback={null}>
      <SignageInner />
    </Suspense>
  );
}
