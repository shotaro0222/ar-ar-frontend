
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import AskSheet, { ChatTurn } from './components/AskSheet';
import { pickJapaneseVoice, splitSentences, startTalk, stopTalk, TalkHolder } from './lib/speech';

const API_BASE = 'https://xr-reference.kyouhitotsu-dev.workers.dev';
// アバター（RobotExpressive / CC0）。public/models に同梱して外部依存をなくしている
@@ -16,53 +18,37 @@ const categoryMeta: Record<string, { label: string; icon: string }> = {

type NewsItem = { title: string; url: string; summary?: string; summaryKind?: 'ai' | 'rss'; source?: string };
type NewsData = Record<string, NewsItem[] | string> & { last_updated?: string };
type Bubble = { label?: string; title: string; sentences?: string[]; source?: string; hint?: boolean; loading?: boolean };
type Current = { cat: string; item: NewsItem };
type Bubble = {
  kind: 'hint' | 'news' | 'answer';
  label?: string;
  title: string;
  sentences?: string[];
  source?: string;
  loading?: boolean;
};

const HINT_BUBBLE: Bubble = {
  hint: true,
  title: 'こんにちは！気になるニュースのタイトルをタップしてね。記事の中身をまとめて、ボクが読み上げるよ🎙️'
  kind: 'hint',
  title: 'こんにちは！ニュースのタイトルをタップすると、記事の中身をボクが読み上げるよ。わからない言葉は「💬 質問」で聞いてね🎙️'
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
const ANIM = { idle: 'Idle', talk: 'Yes', wave: 'Wave', think: 'Standing' } as const;

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

const listOf = (data: NewsData | null, cat: string) => (Array.isArray(data?.[cat]) ? (data![cat] as NewsItem[]) : []);
const categoriesOf = (data: NewsData | null) =>
  data ? Object.keys(data).filter(k => k !== 'last_updated' && listOf(data, k).length > 0) : [];

export default function HomePage() {
  const [newsData, setNewsData] = useState<NewsData | null>(null);
  const [loadError, setLoadError] = useState(false);
@@ -74,14 +60,40 @@ export default function HomePage() {
  const [muted, setMuted] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');

  const [current, setCurrent] = useState<Current | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);

  // 現実空間モード（カメラ映像の上にアバター）と WebXR の AR
  const [reality, setReality] = useState(false);
  const [cameraState, setCameraState] = useState<'off' | 'starting' | 'on' | 'error'>('off');
  const [arActive, setArActive] = useState(false);

  // 質問
  const [askOpen, setAskOpen] = useState(false);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [asking, setAsking] = useState(false);
  const [termsByUrl, setTermsByUrl] = useState<Record<string, string[]>>({});
  const [termsLoading, setTermsLoading] = useState(false);

  const talkRef = useRef<TalkHolder>({ session: null, timer: null, utterances: [] });
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const sessionRef = useRef<object | null>(null); // 「最新の読み上げか」の判定に使う
  const utterQueueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewerRef = useRef<any>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoRef = useRef(false);
  const newsRef = useRef<NewsData | null>(null);
  const currentRef = useRef<Current | null>(null);
  const speakingKeyRef = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const chatForRef = useRef<string>('');
  const waveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  newsRef.current = newsData;
  currentRef.current = current;
  speakingKeyRef.current = speakingKey;
  mutedRef.current = muted;

  // ---------------- ニュース取得 ----------------
  const fetchNews = useCallback(async () => {
    setLoadError(false);
    try {
@@ -97,8 +109,8 @@ export default function HomePage() {
        }
      }
      setNewsData(data);
      const first = Object.keys(data).find(k => Array.isArray(data[k]) && (data[k] as NewsItem[]).length > 0);
      if (first) setActiveCategory(prev => (Array.isArray(data[prev]) && (data[prev] as NewsItem[]).length ? prev : first));
      const first = categoriesOf(data)[0];
      if (first) setActiveCategory(prev => (listOf(data, prev).length ? prev : first));
    } catch (error) {
      console.error('ニュースの取得に失敗しました', error);
      setLoadError(true);
@@ -110,45 +122,52 @@ export default function HomePage() {
    const checkDevice = () => setShowQr(window.innerWidth > 1100);
    checkDevice();
    window.addEventListener('resize', checkDevice);

    try {
      if (localStorage.getItem('ns-muted') === '1') setMuted(true);
    } catch { /* noop */ }
    try { if (localStorage.getItem('ns-muted') === '1') setMuted(true); } catch { /* noop */ }

    // 音声リストは非同期でロードされるブラウザがあるので両方で拾う
    const loadVoice = () => { voiceRef.current = pickJapaneseVoice(); };
    if ('speechSynthesis' in window) {
      loadVoice();
      window.speechSynthesis.addEventListener?.('voiceschanged', loadVoice);
    }

    fetchNews();

    const stopOnHide = () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
    const talk = talkRef.current;
    const stopOnHide = () => stopTalk(talk);
    window.addEventListener('pagehide', stopOnHide);

    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('pagehide', stopOnHide);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoice);
        window.speechSynthesis.cancel();
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoice);
      stopTalk(talk);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [fetchNews]);

  // WebXR の AR セッション開始・終了を検知（AR中もニュースの操作パネルを表示する）
  useEffect(() => {
    const mv = viewerRef.current;
    if (!mv) return;
    const onStatus = (e: any) => {
      const status = e?.detail?.status;
      if (status === 'session-started' || status === 'object-placed') setArActive(true);
      if (status === 'not-presenting' || status === 'failed') setArActive(false);
    };
    mv.addEventListener('ar-status', onStatus);
    return () => mv.removeEventListener('ar-status', onStatus);
  }, []);

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
    document.querySelectorAll<HTMLElement>('.ns-bubble').forEach(box => {
      const el = box.querySelector('.is-reading') as HTMLElement | null;
      if (!el) { if (activeSeg === -1) box.scrollTop = 0; return; }
      const top = el.offsetTop; // 吹き出し(position:relative)基準
      if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight) {
        box.scrollTo({ top: Math.max(0, top - 24), behavior: 'smooth' });
      }
    });
  }, [activeSeg, bubble]);

  // アニメーション切り替え時に確実に再生させる
  useEffect(() => {
@@ -158,235 +177,282 @@ export default function HomePage() {
    }
  }, [animation]);

  const finishTalking = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    sessionRef.current = null;
    utterQueueRef.current = [];
  // ---------------- 読み上げ ----------------
  const endTalkUI = useCallback(() => {
    setSpeakingKey(null);
    setActiveSeg(-1);
    setAnimation(ANIM.idle);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    finishTalking();
  }, [finishTalking]);
  const stopAll = useCallback(() => {
    autoRef.current = false;
    setAutoPlay(false);
    stopTalk(talkRef.current);
    endTalkUI();
  }, [endTalkUI]);

  // 全カテゴリを1列に並べたリスト（連続再生・前後移動用）
  const flatList = useCallback((): Current[] => {
    const data = newsRef.current;
    return categoriesOf(data).flatMap(cat => listOf(data, cat).map(item => ({ cat, item })));
  }, []);

  const readNewsRef = useRef<(cat: string, item: NewsItem, opts?: { auto?: boolean }) => void>(() => {});

  const playStep = useCallback((dir: 1 | -1) => {
    const list = flatList();
    if (!list.length) return;
    const cur = currentRef.current;
    const idx = cur ? list.findIndex(x => x.item.url === cur.item.url) : -1;
    const next = idx < 0 ? list[0] : list[(idx + dir + list.length) % list.length];
    setActiveCategory(next.cat);
    readNewsRef.current(next.cat, next.item, { auto: true });
  }, [flatList]);

  const speak = useCallback((cat: string, item: NewsItem) => {
  const readNews = useCallback((cat: string, item: NewsItem, opts: { auto?: boolean } = {}) => {
    const key = itemKey(cat, item);
    // 読み上げ中の同じニュースをもう一度タップ → 停止
    if (speakingKey === key) {
      stopSpeaking();
    if (!opts.auto && speakingKeyRef.current === key) {
      stopAll();
      return;
    }

    const label = categoryMeta[cat]?.label || cat;
    const hasAiSummary = item.summaryKind === 'ai' && !!item.summary;
    setBubble({ label, title: item.title, sentences: hasAiSummary ? splitSentences(item.summary!) : [], source: item.source, loading: !hasAiSummary });
    setCurrent({ cat, item });
    if (chatForRef.current !== item.url) { chatForRef.current = item.url; setChat([]); }
    setBubble({ kind: 'news', label, title: item.title, sentences: hasAiSummary ? splitSentences(item.summary!) : [], source: item.source, loading: !hasAiSummary });
    setActiveSeg(-1);
    setSpeakingKey(key);
    setAnimation(ANIM.talk);
    if (timerRef.current) clearTimeout(timerRef.current);

    const session = {};
    sessionRef.current = session;
    const alive = () => sessionRef.current === session;

    const canSpeak = !muted && typeof window !== 'undefined' && 'speechSynthesis' in window;
    const synth = canSpeak ? window.speechSynthesis : null;
    if (synth) synth.cancel();

    let outstanding = 0; // まだ読み終わっていない発話の数
    let contentReady = false; // 記事の中身を受け取ったか
    let speechBroken = !synth;

    const silentFinish = (len: number) => {
      // 音声なし（ミュート・非対応・音声エンジンのエラー）のときは、文字数に応じた時間だけ吹き出しで見せる
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { if (alive()) finishTalking(); }, Math.min(25000, Math.max(3000, len * 150)));
    };
    const maybeFinish = () => {
      if (alive() && contentReady && outstanding === 0 && !speechBroken) finishTalking();
    };
    const enqueue = (text: string, seg: number) => {
      if (!synth || speechBroken) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 1.05;
      u.pitch = 1.1;
      if (voiceRef.current) u.voice = voiceRef.current;
      outstanding++;
      u.onstart = () => { if (alive()) setActiveSeg(seg); };
      u.onend = () => { if (!alive()) return; outstanding--; maybeFinish(); };
      u.onerror = (e) => {
        if (!alive()) return;
        if (e.error === 'interrupted' || e.error === 'canceled') { outstanding--; return; }
        speechBroken = true;
        synth.cancel();
        if (contentReady) silentFinish(item.title.length + (item.summary?.length || 0));
      };
      utterQueueRef.current.push(u); // GCで発話が消えるChromeの不具合対策に参照を保持
      synth.speak(u);
    };
    const talk = startTalk(talkRef.current, {
      muted: mutedRef.current,
      voice: voiceRef.current,
      onSeg: setActiveSeg,
      onDone: () => {
        endTalkUI();
        // 連続再生中なら次のニュースへ
        if (autoRef.current) setTimeout(() => { if (autoRef.current) playStep(1); }, 900);
      }
    });

    // 記事の中身を受け取ったら、1文ずつ読み上げに追加する
    const deliver = (summary?: string | null) => {
      if (!alive()) return;
      if (!talk.alive()) return;
      const sentences = summary ? splitSentences(summary) : [];
      setBubble(b => ({ ...b, sentences, loading: false }));
      if (sentences.length) sentences.forEach((t, i) => enqueue(t, i));
      else enqueue('このニュースの中身を取得できませんでした。詳しくは記事ボタンからご覧ください。', -1);
      contentReady = true;
      if (speechBroken) silentFinish(item.title.length + (summary?.length || 0));
      else {
        // 一部ブラウザで onend が来ないケースの保険
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { if (alive()) finishTalking(); }, Math.max(15000, (item.title.length + (summary?.length || 0)) * 450));
        maybeFinish();
      }
      if (sentences.length) sentences.forEach((t, i) => talk.enqueue(t, i));
      else talk.enqueue('このニュースの中身を取得できませんでした。詳しくは記事ボタンからご覧ください。', -1);
      talk.ready(item.title.length + (summary?.length || 30));
    };

    // まずタイトルを読む（タップ直後に発話を始めることで iOS の自動再生制限も回避）
    enqueue(`${label}のニュースです。${item.title}。`, -1);

    if (hasAiSummary) {
      deliver(item.summary);
      return;
    }
    talk.enqueue(`${label}のニュースです。${item.title}。`, -1);
    if (hasAiSummary) return deliver(item.summary);

    // 記事ページから作ったAI要約を取得（サーバー側でキャッシュされるので2回目以降は速い）
    const ctrl = new AbortController();
    const abortTimer = setTimeout(() => ctrl.abort(), 25000);
    fetch(`${API_BASE}/api/summary?url=${encodeURIComponent(item.url)}`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { summary?: string | null; summaryKind?: 'ai' | 'rss' } | null) => {
        const summary = d?.summary || item.summary;
        if (d?.summary) {
          // 次回タップ時はすぐ読めるよう一覧のデータも更新
          setNewsData(prev => {
            if (!prev || !Array.isArray(prev[cat])) return prev;
            return { ...prev, [cat]: (prev[cat] as NewsItem[]).map(i => (i.url === item.url ? { ...i, summary: d.summary!, summaryKind: d.summaryKind } : i)) };
            return { ...prev, [cat]: listOf(prev, cat).map(i => (i.url === item.url ? { ...i, summary: d.summary!, summaryKind: d.summaryKind } : i)) };
          });
        }
        deliver(summary);
        deliver(d?.summary || item.summary);
      })
      .catch(() => deliver(item.summary))
      .finally(() => clearTimeout(abortTimer));
  }, [speakingKey, muted, stopSpeaking, finishTalking]);
  }, [stopAll, endTalkUI, playStep]);
  readNewsRef.current = readNews;

  const toggleAutoPlay = () => {
    if (autoRef.current) { stopAll(); return; }
    autoRef.current = true;
    setAutoPlay(true);
    const cur = currentRef.current;
    if (speakingKeyRef.current) return; // 今の読み上げが終わったら次へ進む
    if (cur) readNews(cur.cat, cur.item, { auto: true });
    else playStep(1);
  };

  const greet = () => {
    if (speakingKey) return;
    if (speakingKeyRef.current || asking) return;
    setBubble(HINT_BUBBLE);
    setAnimation(ANIM.wave);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setAnimation(ANIM.idle), 2200);
    if (waveTimer.current) clearTimeout(waveTimer.current);
    waveTimer.current = setTimeout(() => setAnimation(a => (a === ANIM.wave ? ANIM.idle : a)), 2200);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    if (next) window.speechSynthesis?.cancel();
    try { localStorage.setItem('ns-muted', next ? '1' : '0'); } catch { /* noop */ }
  };

  const categories = newsData ? Object.keys(newsData).filter(k => k !== 'last_updated' && Array.isArray(newsData[k]) && (newsData[k] as NewsItem[]).length > 0) : [];
  const items = (newsData?.[activeCategory] as NewsItem[] | undefined) || [];
  // ---------------- 質問（わからない言葉を聞く） ----------------
  const openAsk = () => {
    setAskOpen(true);
    const cur = currentRef.current;
    if (!cur || termsByUrl[cur.item.url]) return;
    setTermsLoading(true);
    fetch(`${API_BASE}/api/terms?url=${encodeURIComponent(cur.item.url)}`)
      .then(r => (r.ok ? r.json() : { terms: [] }))
      .then(d => setTermsByUrl(m => ({ ...m, [cur.item.url]: Array.isArray(d?.terms) ? d.terms : [] })))
      .catch(() => setTermsByUrl(m => ({ ...m, [cur.item.url]: [] })))
      .finally(() => setTermsLoading(false));
  };

  const ask = async (question: string) => {
    const cur = currentRef.current;
    const history = chat;
    stopAll();
    setChat(c => [...c, { role: 'user', content: question }]);
    setAsking(true);
    setBubble({ kind: 'answer', label: '質問', title: question, loading: true });
    setAnimation(ANIM.think);

    let answer = '';
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(`${API_BASE}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, url: cur?.item.url, history }),
        signal: ctrl.signal
      });
      clearTimeout(t);
      const d = await res.json().catch(() => null);
      answer = d?.answer || '';
    } catch { /* 下でまとめて処理 */ }
    if (!answer) answer = 'ごめんなさい、いまは答えを用意できませんでした。少ししてからもう一度聞いてください。';
    setAsking(false);
    setChat(c => [...c, { role: 'assistant', content: answer }]);

    // アバターが声と吹き出しで答える
    const sentences = splitSentences(answer);
    setBubble({ kind: 'answer', label: '質問', title: question, sentences });
    setSpeakingKey('answer');
    setActiveSeg(-1);
    setAnimation(ANIM.talk);
    const talk = startTalk(talkRef.current, { muted: mutedRef.current, voice: voiceRef.current, onSeg: setActiveSeg, onDone: endTalkUI });
    sentences.forEach((s, i) => talk.enqueue(s, i));
    talk.ready(answer.length);
  };

  // ---------------- 現実空間モード ----------------
  const enterReality = async () => {
    setReality(true);
    setCameraState('starting');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      setCameraState('on');
    } catch (e) {
      console.warn('camera unavailable', e);
      setCameraState('error');
    }
  };

  const exitReality = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState('off');
    setReality(false);
  };

  // ---------------- 表示 ----------------
  const categories = categoriesOf(newsData);
  const items = listOf(newsData, activeCategory);
  const isTalking = speakingKey !== null;
  const overlayShown = reality || arActive;
  const currentTerms = current ? termsByUrl[current.item.url] || [] : [];

  const renderBubble = () => (
    <div key={bubble.kind + bubble.title} className="ns-bubble" role="status" aria-live="polite">
      {bubble.kind === 'hint' ? (
        <div className="ns-bubble-hint">{bubble.title}</div>
      ) : (
        <>
          <span className="ns-bubble-label">
            {bubble.kind === 'answer' ? '💬 質問への答え' : `${bubble.label}のニュース`}
            {isTalking && <span className="ns-bars" aria-hidden="true"><i /><i /><i /></span>}
          </span>
          {bubble.kind === 'answer' ? (
            <div className="ns-answer-q">Q. {bubble.title}</div>
          ) : (
            <div className={`ns-bubble-title${isTalking && activeSeg === -1 ? ' is-reading' : ''}`}>{bubble.title}</div>
          )}
          {bubble.loading ? (
            <p className="ns-bubble-summary ns-loading">
              {bubble.kind === 'answer' ? '考えています' : '記事を読み込んでいます'}
              <span className="ns-dots"><i>.</i><i>.</i><i>.</i></span>
            </p>
          ) : bubble.sentences && bubble.sentences.length > 0 ? (
            <p className="ns-bubble-summary">
              {bubble.sentences.map((t, i) => (
                <span key={i} className={isTalking && activeSeg === i ? 'is-reading' : undefined}>{t}</span>
              ))}
            </p>
          ) : (
            <p className="ns-bubble-summary">このニュースの中身を取得できませんでした。詳しくは「🔗 記事」からご覧ください。</p>
          )}
          {bubble.kind === 'news' && bubble.source && <div className="ns-bubble-source">出典：{bubble.source}</div>}
          {!bubble.loading && (
            <button className="ns-ask-link" onClick={openAsk}>
              💬 {bubble.kind === 'answer' ? 'ほかにも質問する' : 'わからない言葉を質問する'}
            </button>
          )}
        </>
      )}
    </div>
  );

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
        .ns-loading { color: #7c3aed; font-weight: 600; }
        .ns-dots i { font-style: normal; animation: ns-blink 1.2s infinite; }
        .ns-dots i:nth-child(2) { animation-delay: .2s; } .ns-dots i:nth-child(3) { animation-delay: .4s; }
        @keyframes ns-blink { 0%, 100% { opacity: .2; } 50% { opacity: 1; } }
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
  const askSheet = (
    <AskSheet
      open={askOpen}
      onClose={() => setAskOpen(false)}
      newsTitle={current?.item.title}
      terms={currentTerms}
      termsLoading={termsLoading}
      messages={chat}
      busy={asking}
      onSend={ask}
      onBeforeListen={stopAll}
    />
  );

  return (
    <div className={`ns-root${reality ? ' is-reality' : ''}${cameraState === 'error' ? ' ns-camera-error' : ''}`}>
      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8323476567735522"
        crossOrigin="anonymous"
      />
      <Script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js" />

      {/* 現実空間モードの背景（スマホの背面カメラ） */}
      <video ref={videoRef} className="ns-camera" playsInline muted autoPlay aria-hidden="true" />

      {showQr && currentUrl && (
        <div className="ns-qr">
          <div style={{ fontSize: 13, color: '#93c5fd', fontWeight: 800, marginBottom: 8 }}>📱 スマホでXR体験！</div>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 12px', lineHeight: 1.4 }}>
            スマホで読み込むと、アバターを現実空間に呼び出せます。
            スマホで読み込むと、現実空間でアバターがニュースを読んでくれます。
          </p>
          <div style={{ padding: 8, background: '#fff', borderRadius: 12, display: 'inline-block' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
@@ -442,7 +508,7 @@ export default function HomePage() {
                const speaking = speakingKey === key;
                return (
                  <div key={key} role="listitem" className={`ns-item${speaking ? ' is-speaking' : ''}`}>
                    <button className="ns-item-main" onClick={() => speak(activeCategory, item)}
                    <button className="ns-item-main" onClick={() => readNews(activeCategory, item)}
                      aria-label={speaking ? `読み上げを停止：${item.title}` : `読み上げる：${item.title}`}>
                      <span className="ns-speak-icon" aria-hidden="true">
                        {speaking ? <span className="ns-bars"><i /><i /><i /></span> : '🔈'}
@@ -461,31 +527,7 @@ export default function HomePage() {
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
                {bubble.loading ? (
                  <p className="ns-bubble-summary ns-loading">記事を読み込んでいます<span className="ns-dots"><i>.</i><i>.</i><i>.</i></span></p>
                ) : bubble.sentences && bubble.sentences.length > 0 ? (
                  <p className="ns-bubble-summary">
                    {bubble.sentences.map((t, i) => (
                      <span key={i} data-seg={i} className={isTalking && activeSeg === i ? 'is-reading' : undefined}>{t}</span>
                    ))}
                  </p>
                ) : (
                  <p className="ns-bubble-summary">このニュースの中身を取得できませんでした。詳しくは「🔗 記事」からご覧ください。</p>
                )}
                {bubble.source && <div className="ns-bubble-source">出典：{bubble.source}</div>}
              </>
            )}
          </div>
          {renderBubble()}
          <div className="ns-bubble-tail" aria-hidden="true" />
        </div>

@@ -502,8 +544,8 @@ export default function HomePage() {
            disable-pan=""
            touch-action="pan-y"
            interaction-prompt="none"
            camera-orbit="0deg 80deg 14m"
            camera-target="0m 2.3m 0m"
            camera-orbit={reality ? '0deg 78deg 22m' : '0deg 80deg 14m'}
            camera-target={reality ? '0m 3.6m 0m' : '0m 2.3m 0m'}
            field-of-view="30deg"
            shadow-intensity="1"
            exposure="1.1"
@@ -512,19 +554,47 @@ export default function HomePage() {
            animation-crossfade-duration="300"
            onClick={greet}
          >
            <button slot="ar-button" className="ns-chip ns-ar" style={{ position: 'absolute', right: 12, bottom: 12 }}>
              📱 ARで呼び出す
            </button>
            <button slot="ar-button" className="ns-chip ns-ar ns-ar-btn">🕶 床に置くAR</button>

            {/* 現実空間モード・AR中に表示するパネル（model-viewer の中に置くと WebXR の AR 中も表示される） */}
            <div className={`ns-overlay${overlayShown ? ' is-shown' : ''}`} onClick={e => e.stopPropagation()}>
              <div>
                {renderBubble()}
                {reality && cameraState === 'error' && (
                  <div className="ns-overlay-note">カメラを使えないため、背景なしで表示しています</div>
                )}
                {reality && cameraState === 'starting' && <div className="ns-overlay-note">カメラを起動しています…</div>}
              </div>
              <div className="ns-remote" role="toolbar" aria-label="ニュースの操作">
                <button onClick={() => playStep(-1)} aria-label="前のニュース" disabled={!newsData}>⏮</button>
                <button className="is-main" onClick={toggleAutoPlay} aria-label={autoPlay ? '連続再生を止める' : 'ニュースを連続で読む'} disabled={!newsData}>
                  {autoPlay ? '⏸' : '▶'}
                </button>
                <button onClick={() => playStep(1)} aria-label="次のニュース" disabled={!newsData}>⏭</button>
                <button onClick={openAsk} aria-label="質問する">💬</button>
                <button onClick={toggleMute} aria-label={muted ? '音声をオンにする' : '音声をオフにする'}>{muted ? '🔇' : '🔊'}</button>
                {reality && !arActive && <button className="ns-remote-exit" onClick={() => { stopAll(); exitReality(); }}>終了</button>}
              </div>
            </div>
            {arActive && askSheet}
          </model-viewer>

          <div className="ns-controls">
            <button className="ns-chip" onClick={toggleMute} aria-pressed={muted}>
              {muted ? '🔇 音声OFF' : '🔊 音声ON'}
            <button className="ns-chip" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? '音声をオンにする' : '音声をオフにする'}>
              {muted ? '🔇' : '🔊'}
            </button>
            {isTalking && <button className="ns-chip" onClick={stopSpeaking} style={{ marginRight: 'auto', marginLeft: 8 }}>⏹ 停止</button>}
            {isTalking || autoPlay ? (
              <button className="ns-chip" onClick={stopAll}>⏹ 停止</button>
            ) : (
              <button className="ns-chip" onClick={toggleAutoPlay} disabled={!newsData}>▶ 連続再生</button>
            )}
            <button className="ns-chip" onClick={openAsk}>💬 質問</button>
            <button className="ns-chip ns-chip-primary" onClick={enterReality}>📷 現実空間で聞く</button>
          </div>
        </div>
      </section>

      {!arActive && askSheet}
    </div>
  );
}
