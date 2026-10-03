'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';

const API_BASE = 'https://xr-reference.kyouhitotsu-dev.workers.dev';
// アバター（RobotExpressive / CC0）。public/models に同梱して外部依存をなくしている
const AVATAR_SRC = '/models/RobotExpressive.glb';

const categoryMeta: Record<string, { label: string; icon: string }> = {
  it: { label: 'IT', icon: '⚡' },
  business: { label: 'ビジネス', icon: '📈' },
  entertainment: { label: 'エンタメ', icon: '🎬' },
  funny: { label: 'オモシロ', icon: '🎭' }
};

type NewsItem = { title: string; url: string; summary?: string; source?: string };
type NewsData = Record<string, NewsItem[] | string> & { last_updated?: string };
type Bubble = { label?: string; title: string; sentences?: string[]; source?: string; hint?: boolean };

const HINT_BUBBLE: Bubble = {
  hint: true,
  title: 'こんにちは！気になるニュースのタイトルをタップしてね。記事の中身をボクが読み上げるよ🎙️'
};

// アバターのアニメーション名（RobotExpressive.glb に含まれるもの）
const ANIM = { idle: 'Idle', talk: 'Yes', wave: 'Wave', happy: 'ThumbsUp' } as const;

// 読み上げ用に文単位で分割（長すぎる文は読点で分ける）
function splitSentences(text: string): string[] {
  const raw = text.match(/[^。！？!?]+[。！？!?」』）)]*/g) || [text];
  const out: string[] = [];
  for (const s of raw.map(t => t.trim()).filter(Boolean)) {
    if (s.length <= 100) { out.push(s); continue; }
    let buf = '';
    for (const part of s.split(/(?<=、)/)) {
      if ((buf + part).length > 100 && buf) { out.push(buf); buf = ''; }
      buf += part;
    }
    if (buf) out.push(buf);
  }
  return out;
}

const itemKey = (cat: string, item: NewsItem) => `${cat}::${item.title}::${item.url}`;

function pickJapaneseVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter(v => v.lang?.toLowerCase().startsWith('ja'));
  if (!voices.length) return null;
  const preferred = ['Google 日本語', 'Kyoko', 'O-Ren', 'Otoya', 'Nanami', 'Haruka'];
  for (const name of preferred) {
    const v = voices.find(v => v.name.includes(name));
    if (v) return v;
  }
  return voices[0];
}

function formatUpdated(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function HomePage() {
  const [newsData, setNewsData] = useState<NewsData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('it');
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [bubble, setBubble] = useState<Bubble>(HINT_BUBBLE);
  const [activeSeg, setActiveSeg] = useState(-1); // 吹き出し内で今読んでいる文（-1 = タイトル）
  const [animation, setAnimation] = useState<string>(ANIM.idle);
  const [muted, setMuted] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');

  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const sessionRef = useRef<object | null>(null); // 「最新の読み上げか」の判定に使う
  const utterQueueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewerRef = useRef<any>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  const fetchNews = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch(`${API_BASE}/api/news`);
      if (!res.ok) throw new Error(String(res.status));
      const data: NewsData = await res.json();
      // 中身（要約）があるニュースだけを表示する。要約付きが1件もない旧形式のデータはそのまま表示
      const hasAnySummary = Object.values(data).some(v => Array.isArray(v) && v.some(i => i?.summary));
      if (hasAnySummary) {
        for (const k of Object.keys(data)) {
          const v = data[k];
          if (Array.isArray(v)) data[k] = v.filter(i => i?.summary);
        }
      }
      setNewsData(data);
      const first = Object.keys(data).find(k => Array.isArray(data[k]) && (data[k] as NewsItem[]).length > 0);
      if (first) setActiveCategory(prev => (Array.isArray(data[prev]) && (data[prev] as NewsItem[]).length ? prev : first));
    } catch (error) {
      console.error('ニュースの取得に失敗しました', error);
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    setCurrentUrl(window.location.href);
    const checkDevice = () => setShowQr(window.innerWidth > 1100);
    checkDevice();
    window.addEventListener('resize', checkDevice);

    try {
      if (localStorage.getItem('ns-muted') === '1') setMuted(true);
    } catch { /* noop */ }

    // 音声リストは非同期でロードされるブラウザがあるので両方で拾う
    const loadVoice = () => { voiceRef.current = pickJapaneseVoice(); };
    if ('speechSynthesis' in window) {
      loadVoice();
      window.speechSynthesis.addEventListener?.('voiceschanged', loadVoice);
    }

    fetchNews();

    const stopOnHide = () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
    window.addEventListener('pagehide', stopOnHide);

    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('pagehide', stopOnHide);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoice);
        window.speechSynthesis.cancel();
      }
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchNews]);

  // 今読んでいる文が吹き出しの中で見えるようにスクロール
  useEffect(() => {
    const box = bubbleRef.current;
    const el = box?.querySelector('.is-reading') as HTMLElement | null;
    if (!box) return;
    if (!el) { if (activeSeg === -1) box.scrollTop = 0; return; }
    const top = el.offsetTop; // 吹き出し(position:relative)基準
    if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTo({ top: Math.max(0, top - 24), behavior: 'smooth' });
    }
  }, [activeSeg]);

  // アニメーション切り替え時に確実に再生させる
  useEffect(() => {
    const mv = viewerRef.current;
    if (mv && typeof mv.play === 'function') {
      try { mv.play(); } catch { /* モデル未ロード時は無視 */ }
    }
  }, [animation]);

  const finishTalking = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    sessionRef.current = null;
    utterQueueRef.current = [];
    setSpeakingKey(null);
    setActiveSeg(-1);
    setAnimation(ANIM.idle);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    finishTalking();
  }, [finishTalking]);

  const speak = useCallback((cat: string, item: NewsItem) => {
    const key = itemKey(cat, item);
    // 読み上げ中の同じニュースをもう一度タップ → 停止
    if (speakingKey === key) {
      stopSpeaking();
      return;
    }

    const label = categoryMeta[cat]?.label || cat;
    const sentences = item.summary ? splitSentences(item.summary) : [];
    setBubble({ label, title: item.title, sentences, source: item.source });
    setActiveSeg(-1);
    setSpeakingKey(key);
    setAnimation(ANIM.talk);
    if (timerRef.current) clearTimeout(timerRef.current);

    const session = {};
    sessionRef.current = session;
    const totalLen = item.title.length + (item.summary?.length || 0);

    const canSpeak = !muted && typeof window !== 'undefined' && 'speechSynthesis' in window;
    if (!canSpeak) {
      // ミュート時・非対応ブラウザでは吹き出しだけで伝え、文字数に応じて会話モーションを止める
      timerRef.current = setTimeout(finishTalking, Math.min(20000, Math.max(2500, totalLen * 150)));
      return;
    }

    // 「タイトル → 記事の中身（1文ずつ）」の順に読み上げる。
    // 1文ずつ分けるのは、長文が途中で切れるブラウザ不具合の回避と、吹き出しで今読んでいる文を示すため。
    const segments: { text: string; seg: number }[] = [
      { text: `${label}のニュースです。${item.title}。`, seg: -1 },
      ...sentences.map((t, i) => ({ text: t, seg: i }))
    ];
    if (!sentences.length) segments.push({ text: 'このニュースには概要がありません。詳しくは記事ボタンからご覧ください。', seg: -1 });

    const synth = window.speechSynthesis;
    synth.cancel();
    const alive = () => sessionRef.current === session;
    segments.forEach(({ text, seg }, idx) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 1.05;
      u.pitch = 1.1;
      if (voiceRef.current) u.voice = voiceRef.current;
      u.onstart = () => { if (alive()) setActiveSeg(seg); };
      if (idx === segments.length - 1) u.onend = () => { if (alive()) finishTalking(); };
      u.onerror = (e) => {
        if (!alive()) return;
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        // 音声エンジンが使えない環境では、吹き出しだけで一定時間伝えてから終える
        sessionRef.current = null;
        synth.cancel();
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(finishTalking, Math.min(20000, Math.max(2500, totalLen * 150)));
      };
      utterQueueRef.current.push(u); // GCで発話が消えるChromeの不具合対策に参照を保持
      synth.speak(u);
    });
    // 一部ブラウザで onend が来ないケースの保険
    timerRef.current = setTimeout(() => { if (alive()) finishTalking(); }, Math.max(10000, totalLen * 450));
  }, [speakingKey, muted, stopSpeaking, finishTalking]);

  const greet = () => {
    if (speakingKey) return;
    setBubble(HINT_BUBBLE);
    setAnimation(ANIM.wave);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setAnimation(ANIM.idle), 2200);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    try { localStorage.setItem('ns-muted', next ? '1' : '0'); } catch { /* noop */ }
  };

  const categories = newsData ? Object.keys(newsData).filter(k => k !== 'last_updated' && Array.isArray(newsData[k]) && (newsData[k] as NewsItem[]).length > 0) : [];
  const items = (newsData?.[activeCategory] as NewsItem[] | undefined) || [];
  const isTalking = speakingKey !== null;

  return (
    <div className="ns-root">
      <style dangerouslySetInnerHTML={{ __html: `
        html, body { margin: 0; padding: 0; background-color: #0b0f19; overflow: hidden; height: 100%; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        .ns-root {
          height: 100vh; height: 100dvh; max-width: 720px; margin: 0 auto;
          display: flex; flex-direction: column; color: #f3f4f6;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", Roboto, sans-serif;
        }
        .ns-top { flex: 1 1 55%; min-height: 0; display: flex; flex-direction: column; padding: 14px 16px 0; }
        .ns-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
        .ns-updated { font-size: 11px; color: #6b7280; white-space: nowrap; }
        .ns-tabs { display: flex; gap: 6px; padding: 4px; background: #111827; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.08); overflow-x: auto; margin-bottom: 10px; flex-shrink: 0; scrollbar-width: none; }
        .ns-tab { flex: 1; padding: 9px 10px; border-radius: 8px; border: none; background: transparent; color: #9ca3af;
          font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center;
          gap: 6px; white-space: nowrap; transition: all .2s ease; }
        .ns-tab[aria-selected="true"] { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; font-weight: 700; }
        .ns-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;
          padding-bottom: 12px; overscroll-behavior: contain; }
        .ns-item { display: flex; align-items: stretch; gap: 10px; padding: 0; border-radius: 12px; background: #111827;
          border: 1px solid rgba(255,255,255,0.05); transition: all .2s ease; }
        .ns-item.is-speaking { background: rgba(30,41,59,0.9); border-color: #a855f7; box-shadow: 0 0 16px rgba(168,85,247,0.3); }
        .ns-item-main { flex: 1; text-align: left; background: none; border: none; color: inherit; font: inherit;
          padding: 12px 0 12px 14px; cursor: pointer; display: flex; gap: 10px; align-items: center; min-width: 0; }
        .ns-item-main:hover .ns-title { color: #fff; }
        .ns-item-main:focus-visible { outline: 2px solid #60a5fa; outline-offset: -2px; border-radius: 12px; }
        .ns-speak-icon { flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
          background: rgba(255,255,255,0.06); font-size: 14px; }
        .is-speaking .ns-speak-icon { background: rgba(168,85,247,0.25); }
        .ns-title { font-size: 14px; font-weight: 600; color: #d1d5db; line-height: 1.45; }
        .is-speaking .ns-title { color: #fff; }
        .ns-link { align-self: center; margin-right: 12px; font-size: 11px; color: #93c5fd; text-decoration: none;
          padding: 5px 8px; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3);
          border-radius: 6px; font-weight: 600; white-space: nowrap; }
        .ns-bars { display: inline-flex; gap: 2px; align-items: flex-end; height: 14px; }
        .ns-bars i { width: 3px; background: #c084fc; border-radius: 2px; animation: ns-bar .9s ease-in-out infinite; }
        .ns-bars i:nth-child(2) { animation-delay: .15s; } .ns-bars i:nth-child(3) { animation-delay: .3s; }
        @keyframes ns-bar { 0%,100% { height: 4px; } 50% { height: 14px; } }

        .ns-stage { flex: 0 0 45%; min-height: 260px; position: relative; display: flex; flex-direction: column;
          border-top: 1px solid rgba(147,197,253,0.18);
          background: radial-gradient(ellipse at 50% 85%, rgba(59,130,246,0.28), transparent 60%),
                      radial-gradient(ellipse at 50% 100%, rgba(168,85,247,0.25), transparent 70%), #0b0f19; }
        .ns-bubble-wrap { padding: 12px 16px 0; position: relative; z-index: 2; }
        .ns-bubble { position: relative; background: #f8fafc; color: #0f172a; border-radius: 16px; padding: 10px 14px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.45); max-height: min(190px, 24dvh); overflow-y: auto; animation: ns-pop .25s ease-out; }
        .ns-bubble-tail { width: 0; height: 0; margin: 0 auto; border: 10px solid transparent;
          border-top-color: #f8fafc; border-bottom: 0; }
        .ns-bubble-label { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700;
          color: #7c3aed; background: #ede9fe; padding: 2px 6px; border-radius: 4px; margin-bottom: 4px; }
        .ns-bubble-title { font-size: 14px; font-weight: 700; line-height: 1.5; }
        .ns-bubble-hint { font-size: 13px; font-weight: 600; line-height: 1.5; color: #334155; }
        .ns-bubble-summary { font-size: 13px; line-height: 1.7; color: #334155; margin: 6px 0 0; }
        .ns-bubble-summary span { transition: background-color .2s ease; border-radius: 3px; }
        .ns-bubble .is-reading { background: #ede9fe; color: #4c1d95; box-shadow: 0 0 0 2px #ede9fe; }
        .ns-bubble-source { font-size: 10px; color: #94a3b8; margin-top: 6px; text-align: right; }
        @keyframes ns-pop { from { transform: scale(.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .ns-viewer-wrap { flex: 1; min-height: 0; position: relative; }
        model-viewer { width: 100%; height: 100%; --poster-color: transparent; background: transparent; }
        model-viewer:focus { outline: none; }
        .ns-controls { position: absolute; left: 12px; right: 12px; bottom: 12px; display: flex;
          justify-content: space-between; align-items: center; pointer-events: none; z-index: 3; }
        .ns-controls > * { pointer-events: auto; }
        .ns-chip { border: 1px solid rgba(147,197,253,0.3); background: rgba(17,24,39,0.85); color: #e5e7eb;
          font-size: 12px; font-weight: 600; padding: 8px 12px; border-radius: 9999px; cursor: pointer;
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
        .ns-ar { background: linear-gradient(135deg, #a855f7 0%, #3b82f6 50%, #06b6d4 100%); border: none; color: #fff;
          box-shadow: 0 4px 16px rgba(168,85,247,0.35); }
        .ns-qr { position: fixed; top: 24px; right: 24px; width: 220px; background: rgba(17,24,39,0.9);
          backdrop-filter: blur(8px); padding: 16px; border-radius: 16px; border: 1px solid rgba(59,130,246,0.3);
          text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index: 50; }
        .ns-state { text-align: center; color: #9ca3af; padding: 32px 8px; font-size: 13px; }
        @media (prefers-reduced-motion: reduce) { .ns-bars i, .ns-bubble { animation: none; } }
      `}} />

      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8323476567735522"
        crossOrigin="anonymous"
      />
      <Script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js" />

      {showQr && currentUrl && (
        <div className="ns-qr">
          <div style={{ fontSize: 13, color: '#93c5fd', fontWeight: 800, marginBottom: 8 }}>📱 スマホでXR体験！</div>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 12px', lineHeight: 1.4 }}>
            スマホで読み込むと、アバターを現実空間に呼び出せます。
          </p>
          <div style={{ padding: 8, background: '#fff', borderRadius: 12, display: 'inline-block' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentUrl)}`} alt="このページのQRコード" style={{ width: 150, height: 150, display: 'block' }} />
          </div>
        </div>
      )}

      {/* ===== 上部：ニュース ===== */}
      <section className="ns-top" aria-label="ニュース一覧">
        <header className="ns-header">
          <svg viewBox="0 0 300 52" style={{ width: 210, height: 'auto' }} role="img" aria-label="News Summoner">
            <defs>
              <linearGradient id="textGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="50%" stopColor="#93c5fd" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>
            </defs>
            <circle cx="26" cy="26" r="18" fill="none" stroke="url(#textGrad)" strokeWidth="1.5" strokeDasharray="4 5" />
            <circle cx="26" cy="26" r="8" fill="url(#textGrad)" />
            <text x="54" y="35" fontFamily="system-ui, sans-serif" fontSize="25" fontWeight="900" fill="url(#textGrad)">News Summoner</text>
          </svg>
          {newsData?.last_updated && <span className="ns-updated">更新 {formatUpdated(newsData.last_updated)}</span>}
        </header>

        {loadError ? (
          <div className="ns-state">
            ニュースを読み込めませんでした。
            <div style={{ marginTop: 12 }}>
              <button className="ns-chip" onClick={fetchNews}>🔄 再読み込み</button>
            </div>
          </div>
        ) : !newsData ? (
          <div className="ns-state">最新のニュースを読み込んでいます...</div>
        ) : (
          <>
            <div className="ns-tabs" role="tablist">
              {categories.map(key => {
                const meta = categoryMeta[key] || { label: key, icon: '📰' };
                return (
                  <button key={key} role="tab" aria-selected={activeCategory === key} className="ns-tab"
                    onClick={() => setActiveCategory(key)}>
                    <span>{meta.icon}</span><span>{meta.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="ns-list" role="list">
              {items.map(item => {
                const key = itemKey(activeCategory, item);
                const speaking = speakingKey === key;
                return (
                  <div key={key} role="listitem" className={`ns-item${speaking ? ' is-speaking' : ''}`}>
                    <button className="ns-item-main" onClick={() => speak(activeCategory, item)}
                      aria-label={speaking ? `読み上げを停止：${item.title}` : `読み上げる：${item.title}`}>
                      <span className="ns-speak-icon" aria-hidden="true">
                        {speaking ? <span className="ns-bars"><i /><i /><i /></span> : '🔈'}
                      </span>
                      <span className="ns-title">{item.title}</span>
                    </button>
                    <a className="ns-link" href={item.url} target="_blank" rel="noreferrer">🔗 記事</a>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ===== 下部：XRアバター ===== */}
      <section className="ns-stage" aria-label="XRアバター">
        <div className="ns-bubble-wrap">
          <div key={bubble.title} ref={bubbleRef} className="ns-bubble" role="status" aria-live="polite">
            {bubble.hint ? (
              <div className="ns-bubble-hint">{bubble.title}</div>
            ) : (
              <>
                <span className="ns-bubble-label">
                  {bubble.label}のニュース
                  {isTalking && <span className="ns-bars" aria-hidden="true"><i /><i /><i /></span>}
                </span>
                <div className={`ns-bubble-title${isTalking && activeSeg === -1 ? ' is-reading' : ''}`}>{bubble.title}</div>
                {bubble.sentences && bubble.sentences.length > 0 ? (
                  <p className="ns-bubble-summary">
                    {bubble.sentences.map((t, i) => (
                      <span key={i} data-seg={i} className={isTalking && activeSeg === i ? 'is-reading' : undefined}>{t}</span>
                    ))}
                  </p>
                ) : (
                  <p className="ns-bubble-summary">このニュースには概要がありません。詳しくは「🔗 記事」からご覧ください。</p>
                )}
                {bubble.source && <div className="ns-bubble-source">出典：{bubble.source}</div>}
              </>
            )}
          </div>
          <div className="ns-bubble-tail" aria-hidden="true" />
        </div>

        <div className="ns-viewer-wrap">
          <model-viewer
            ref={viewerRef}
            src={AVATAR_SRC}
            alt="ニュースを読み上げるロボットのアバター"
            ar=""
            ar-modes="webxr scene-viewer quick-look"
            ar-placement="floor"
            camera-controls=""
            disable-zoom=""
            disable-pan=""
            touch-action="pan-y"
            interaction-prompt="none"
            camera-orbit="0deg 80deg 14m"
            camera-target="0m 2.3m 0m"
            field-of-view="30deg"
            shadow-intensity="1"
            exposure="1.1"
            autoplay=""
            animation-name={animation}
            animation-crossfade-duration="300"
            onClick={greet}
          >
            <button slot="ar-button" className="ns-chip ns-ar" style={{ position: 'absolute', right: 12, bottom: 12 }}>
              📱 ARで呼び出す
            </button>
          </model-viewer>

          <div className="ns-controls">
            <button className="ns-chip" onClick={toggleMute} aria-pressed={muted}>
              {muted ? '🔇 音声OFF' : '🔊 音声ON'}
            </button>
            {isTalking && <button className="ns-chip" onClick={stopSpeaking} style={{ marginRight: 'auto', marginLeft: 8 }}>⏹ 停止</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
