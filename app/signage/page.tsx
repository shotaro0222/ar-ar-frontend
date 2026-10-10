'use client';

// デジタルサイネージ表示：/signage?device=端末キー
// - ニュースを自動で読み上げ続け、数本ごとにスポンサー／ローカルの3Dをはさむ
// - 「話しかけてね」ボタンで、アバターと声で会話できる（端末キーがあると回数制限がゆるく、地域情報も答える）
// - キオスク端末では Chrome を --autoplay-policy=no-user-gesture-required で起動し ?autostart=1 を付けると無人で開始

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useSearchParams } from 'next/navigation';
import { API_BASE, fetchConfig, Placement, track } from '../lib/api';
import { getRecognition, pickJapaneseVoice, recognitionSupported, splitSentences, startTalk, stopTalk, TalkHolder } from '../lib/speech';

const AVATAR_SRC = '/models/RobotExpressive.glb';
const ANIM = { idle: 'Idle', talk: 'Yes', wave: 'Wave', think: 'Standing' };
const LABELS: Record<string, string> = {
  it: 'IT', business: 'ビジネス', entertainment: 'エンタメ', funny: 'オモシロ', politics: '政治', society: '社会',
  world: '国際', sports: 'スポーツ', science: '科学', lifestyle: '暮らし', local: 'ローカル'
};
const SPONSOR_EVERY = 3; // ニュース何本ごとに3D枠をはさむか

type Item = { title: string; url: string; summary?: string; source?: string };
type Slide = { kind: 'news'; cat: string; item: Item } | { kind: 'placement'; p: Placement };
type Turn = { role: 'user' | 'assistant'; content: string };

function SignageInner() {
  const params = useSearchParams();
  const deviceKey = params.get('device') || '';
  const autostart = params.get('autostart') === '1';

  const [started, setStarted] = useState(autostart);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [slide, setSlide] = useState<Slide | null>(null);
  const [sentences, setSentences] = useState<string[]>([]);
  const [seg, setSeg] = useState(-1);
  const [anim, setAnim] = useState(ANIM.idle);
  const [mode, setMode] = useState<'loop' | 'listening' | 'thinking' | 'answering'>('loop');
  const [heard, setHeard] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [now, setNow] = useState(new Date());
  const [siteUrl, setSiteUrl] = useState('');

  const talkRef = useRef<TalkHolder>({ session: null, timer: null, utterances: [] });
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const idxRef = useRef(0);
  const slidesRef = useRef<Slide[]>([]);
  const modeRef = useRef(mode);
  const recRef = useRef<any>(null);
  const silenceRef = useRef(0);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewerRef = useRef<any>(null);
  const turnsRef = useRef<Turn[]>([]);
  const slideRef = useRef<Slide | null>(null);
  modeRef.current = mode;
  slidesRef.current = slides;
  turnsRef.current = turns;
  slideRef.current = slide;

  // ---------- データ読み込み（30分ごとに更新） ----------
  useEffect(() => {
    setSiteUrl(window.location.origin + '/');
    const load = async () => {
      const [cfg, news] = await Promise.all([
        fetchConfig(),
        fetch(`${API_BASE}/api/news`).then(r => r.json()).catch(() => null)
      ]);
      const newsSlides: Slide[] = [];
      if (news) {
        for (const cat of Object.keys(news)) {
          if (!Array.isArray(news[cat])) continue;
          news[cat].filter((i: Item) => i.summary).slice(0, 3).forEach((item: Item) => newsSlides.push({ kind: 'news', cat, item }));
        }
      }
      // ローカル・スポンサーの3D枠を一定間隔ではさむ（ローカルを優先）
      const pls = [...cfg.placements].sort((a, b) => (a.type === b.type ? 0 : a.type === 'local' ? -1 : 1));
      const out: Slide[] = [];
      let pi = 0;
      newsSlides.forEach((s, i) => {
        out.push(s);
        if (pls.length && (i + 1) % SPONSOR_EVERY === 0) out.push({ kind: 'placement', p: pls[pi++ % pls.length] });
      });
      if (!newsSlides.length) pls.forEach(p => out.push({ kind: 'placement', p }));
      setSlides(out);
    };
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    const c = setInterval(() => setNow(new Date()), 30 * 1000);
    const loadVoice = () => { voiceRef.current = pickJapaneseVoice(); };
    loadVoice();
    window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoice);
    const talk = talkRef.current;
    return () => { clearInterval(t); clearInterval(c); stopTalk(talk); };
  }, []);

  useEffect(() => {
    const mv = viewerRef.current;
    if (mv?.play) try { mv.play(); } catch { /* noop */ }
  }, [anim, slide]);

  // ---------- 自動再生ループ ----------
  const say = useCallback((lines: { text: string; seg: number }[], onDone: () => void) => {
    setSeg(-1);
    const talk = startTalk(talkRef.current, { muted: false, voice: voiceRef.current, onSeg: setSeg, onDone });
    lines.forEach(l => talk.enqueue(l.text, l.seg));
    talk.ready(lines.reduce((n, l) => n + l.text.length, 0));
  }, []);

  const playNext = useCallback(() => {
    if (modeRef.current !== 'loop') return;
    const list = slidesRef.current;
    if (!list.length) { loopTimer.current = setTimeout(playNext, 5000); return; }
    const s = list[idxRef.current % list.length];
    idxRef.current++;
    setSlide(s);
    const next = () => { setAnim(ANIM.idle); loopTimer.current = setTimeout(playNext, 1500); };
    if (s.kind === 'news') {
      const ss = splitSentences(s.item.summary || '');
      setSentences(ss);
      setAnim(ANIM.talk);
      say([{ text: `${LABELS[s.cat] || s.cat}のニュースです。${s.item.title}。`, seg: -1 }, ...ss.map((text, i) => ({ text, seg: i }))], next);
    } else {
      const ss = splitSentences(s.p.description);
      setSentences(ss);
      track(s.p.type === 'sponsor' ? 'sponsor_impression' : 'local_impression', s.p.id, false);
      const intro = s.p.type === 'sponsor' ? `ここで、${s.p.sponsor}からのお知らせです。` : `${s.p.region || ''}の見どころ、${s.p.title}をご紹介します。`;
      say([{ text: intro, seg: -1 }, ...ss.map((text, i) => ({ text, seg: i }))], () => { loopTimer.current = setTimeout(next, 6000); });
    }
  }, [say]);

  useEffect(() => {
    if (started && slides.length && !slide) playNext();
  }, [started, slides, slide, playNext]);

  // ---------- 会話 ----------
  const backToLoop = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    setMode('loop');
    setTurns([]);
    setHeard('');
    modeRef.current = 'loop';
    if (loopTimer.current) clearTimeout(loopTimer.current);
    loopTimer.current = setTimeout(playNext, 800);
  }, [playNext]);

  const listen = useCallback(() => {
    const rec = getRecognition();
    if (!rec) return;
    try { recRef.current?.abort(); } catch { /* noop */ }
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    setMode('listening');
    setHeard('');
    setAnim(ANIM.idle);
    let finalText = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
      }
      setHeard(finalText + interim);
    };
    rec.onerror = () => { /* onend で処理 */ };
    rec.onend = () => {
      if (modeRef.current !== 'listening') return;
      const q = finalText.trim();
      if (!q) {
        // 2回続けて無言なら、ニュースの読み上げに戻る
        silenceRef.current++;
        if (silenceRef.current >= 2) { silenceRef.current = 0; backToLoop(); }
        else listenRef.current();
        return;
      }
      silenceRef.current = 0;
      answerRef.current(q);
    };
    recRef.current = rec;
    try { rec.start(); } catch { backToLoop(); }
  }, [backToLoop]);

  const answer = async (q: string) => {
    setMode('thinking');
    setAnim(ANIM.think);
    const history = turnsRef.current.slice(-6);
    setTurns(t => [...t, { role: 'user', content: q }]);
    let a = '';
    try {
      const cur = slideRef.current;
      const res = await fetch(`${API_BASE}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          history,
          device: deviceKey || undefined,
          url: cur?.kind === 'news' ? cur.item.url : undefined,
          placement: cur?.kind === 'placement' ? cur.p.id : undefined
        })
      });
      a = (await res.json())?.answer || '';
    } catch { /* noop */ }
    if (!a) a = 'ごめんなさい、うまく聞き取れなかったみたいです。もう一度話しかけてね。';
    setTurns(t => [...t, { role: 'assistant', content: a }]);
    setMode('answering');
    setAnim(ANIM.talk);
    const ss = splitSentences(a);
    setSentences(ss);
    say(ss.map((text, i) => ({ text, seg: i })), () => {
      setAnim(ANIM.idle);
      // 続けて聞き取る（ハンズフリー会話）
      if (modeRef.current === 'answering') listenRef.current();
    });
  };

  const listenRef = useRef(listen);
  listenRef.current = listen;
  const answerRef = useRef(answer);
  answerRef.current = answer;

  const startTalkMode = () => {
    if (!started) setStarted(true);
    if (loopTimer.current) clearTimeout(loopTimer.current);
    stopTalk(talkRef.current);
    silenceRef.current = 0;
    setTurns([]);
    setAnim(ANIM.wave);
    modeRef.current = 'answering';
    setMode('answering');
    const greet = 'はーい！なんでも話しかけてね。';
    setSentences([greet]);
    say([{ text: greet, seg: 0 }], () => listenRef.current());
  };

  const canTalk = typeof window !== 'undefined' && recognitionSupported();
  const p = slide?.kind === 'placement' ? slide.p : null;
  const lastAnswer = [...turns].reverse().find(t => t.role === 'assistant');
  const lastQ = [...turns].reverse().find(t => t.role === 'user');
  const talking = mode !== 'loop';

  return (
    <div className="sg-root" onClick={() => !started && setStarted(true)}>
      <Script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js" />

      <header className="sg-head">
        <div className="sg-logo">🔮 News Summoner</div>
        <div className="sg-clock">
          {now.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}{' '}
          {now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </header>

      <main className="sg-main">
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

        <section className="sg-panel">
          {talking ? (
            <div className="sg-bubble">
              <div className="sg-label">💬 おしゃべり中</div>
              {lastQ && <div className="sg-q">「{lastQ.content}」</div>}
              {mode === 'listening' && <div className="sg-listen">🎤 聞いています… {heard && <span>{heard}</span>}</div>}
              {mode === 'thinking' && <div className="sg-listen">考えています…</div>}
              {mode === 'answering' && (
                <p className="sg-text">{(lastAnswer ? splitSentences(lastAnswer.content) : sentences).map((t, i) => (
                  <span key={i} className={seg === i ? 'is-reading' : undefined}>{t}</span>
                ))}</p>
              )}
              <button className="sg-btn sg-btn-sub" onClick={e => { e.stopPropagation(); try { recRef.current?.abort(); } catch { /* noop */ } stopTalk(talkRef.current); backToLoop(); }}>
                ニュースに戻る
              </button>
            </div>
          ) : slide ? (
            <div className="sg-bubble">
              <div className="sg-label">
                {slide.kind === 'news' ? `${LABELS[slide.cat] || slide.cat}のニュース` : slide.p.type === 'sponsor' ? 'スポンサーからのお知らせ' : '地域のおすすめ'}
              </div>
              <div className={`sg-title${seg === -1 ? ' is-reading' : ''}`}>{slide.kind === 'news' ? slide.item.title : slide.p.title}</div>
              <p className="sg-text">{sentences.map((t, i) => <span key={i} className={seg === i ? 'is-reading' : undefined}>{t}</span>)}</p>
              {slide.kind === 'news' && slide.item.source && <div className="sg-source">出典：{slide.item.source}</div>}
            </div>
          ) : (
            <div className="sg-bubble"><div className="sg-title">ニュースを準備しています…</div></div>
          )}

          <div className="sg-bottom">
            {canTalk && !talking && (
              <button className="sg-btn" onClick={e => { e.stopPropagation(); startTalkMode(); }}>🎤 話しかけてね</button>
            )}
            {siteUrl && (
              <div className="sg-qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(p?.linkUrl || siteUrl)}`} alt="QRコード" />
                <span>{p?.linkUrl ? '詳しくはこちら' : 'スマホで続きを見る'}</span>
              </div>
            )}
          </div>
        </section>
      </main>

      {!started && (
        <div className="sg-start">
          <div>🔮</div>
          <div>画面をタッチして開始</div>
          <small>音声が流れます</small>
        </div>
      )}
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
