'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import AskSheet, { ChatTurn } from './components/AskSheet';
import EffectLayer, { EFFECTS, EffectKind, MAGIC_COLORS } from './components/EffectLayer';
import PremiumSheet from './components/PremiumSheet';
import { pickJapaneseVoice, splitSentences, startTalk, stopTalk, TalkHolder } from './lib/speech';
import { API_BASE, checkPremium, claimStripe, EMPTY_CONFIG, fetchConfig, Placement, PremiumState, PublicConfig, sponsorFor, track } from './lib/api';
import { capturePhoto } from './lib/photo';
// アバター（RobotExpressive / CC0）。public/models に同梱して外部依存をなくしている
const AVATAR_SRC = '/models/RobotExpressive.glb';

const categoryMeta: Record<string, { label: string; icon: string; meaning: string }> = {
  local: { label: 'ローカル', icon: '📍', meaning: '自治体や観光協会が紹介する、地域の見どころや特産品の情報です。3Dで目の前に呼び出せます。' },
  it: { label: 'IT', icon: '⚡', meaning: 'コンピューターやインターネット、アプリなどの情報技術に関するニュースです。' },
  business: { label: 'ビジネス', icon: '📈', meaning: '会社の活動や新しい商品、働き方など、仕事や企業に関するニュースです。' },
  entertainment: { label: 'エンタメ', icon: '🎬', meaning: '映画や音楽、テレビ、芸能など、楽しみや文化に関するニュースです。' },
  funny: { label: 'オモシロ', icon: '🎭', meaning: '思わず笑ったり驚いたりする、ユニークで楽しい話題のニュースです。' },
  politics: { label: '政治', icon: '🏛️', meaning: '国や地域のルール、政策、選挙など、政治の動きに関するニュースです。' },
  society: { label: '社会', icon: '🏙️', meaning: '事件や事故、地域の出来事、社会が抱える課題などに関するニュースです。' },
  world: { label: '国際', icon: '🌏', meaning: '日本以外の国や地域で起きた出来事、国どうしの関係に関するニュースです。' },
  sports: { label: 'スポーツ', icon: '⚽', meaning: '試合の結果や選手の活躍、大会など、スポーツに関するニュースです。' },
  science: { label: '科学', icon: '🔬', meaning: '自然のしくみを調べる研究や、新しい発見・技術に関するニュースです。' },
  lifestyle: { label: '暮らし', icon: '🏠', meaning: '健康や食事、住まいなど、毎日の生活に役立つ話題のニュースです。' }
};

type NewsItem = { title: string; url: string; summary?: string; summaryKind?: 'ai' | 'rss'; source?: string; placementId?: string };
type NewsData = Record<string, NewsItem[] | string> & { last_updated?: string };
type Current = { cat: string; item: NewsItem };
type Bubble = {
  kind: 'hint' | 'news' | 'answer' | 'category' | 'placement';
  label?: string;
  title: string;
  sentences?: string[];
  source?: string;
  loading?: boolean;
  placement?: Placement; // kind: 'placement'（スポンサー／ローカルの3D）
};

const HINT_BUBBLE: Bubble = {
  kind: 'hint',
  title: 'こんにちは！ニュースのタイトルをタップすると、記事の中身をボクが読み上げるよ。「💬 話す」でボクとおしゃべりもできるよ🎙️'
};

// アバターのアニメーション名（RobotExpressive.glb に含まれるもの）
const ANIM = { idle: 'Idle', talk: 'Yes', wave: 'Wave', think: 'Standing' } as const;

const itemKey = (cat: string, item: NewsItem) => `${cat}::${item.title}::${item.url}`;

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
  const [activeCategory, setActiveCategory] = useState<string>('it');
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [bubble, setBubble] = useState<Bubble>(HINT_BUBBLE);
  const [activeSeg, setActiveSeg] = useState(-1); // 吹き出し内で今読んでいる文（-1 = タイトル）
  const [animation, setAnimation] = useState<string>(ANIM.idle);
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
  const [answerTick, setAnswerTick] = useState(0); // 答えを読み終えるたびに増える（ハンズフリー会話用）

  // マネタイズ：掲載枠（スポンサー／ローカル3D）・エフェクト・AR写真・プレミアム
  const [rawNews, setRawNews] = useState<NewsData | null>(null);
  const [config, setConfig] = useState<PublicConfig>(EMPTY_CONFIG);
  const [premium, setPremium] = useState<PremiumState>({ active: false });
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [effectOpen, setEffectOpen] = useState(false);
  const [summoned, setSummoned] = useState<Placement | null>(null);
  const [effect, setEffect] = useState<EffectKind>('none');
  const [effectColor, setEffectColor] = useState(MAGIC_COLORS[0]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [localRegion, setLocalRegion] = useState('');
  const effectRef = useRef<HTMLCanvasElement | null>(null);
  const summonedRef = useRef<Placement | null>(null);
  summonedRef.current = summoned;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const talkRef = useRef<TalkHolder>({ session: null, timer: null, utterances: [] });
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const viewerRef = useRef<any>(null);
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
      setRawNews(data);
    } catch (error) {
      console.error('ニュースの取得に失敗しました', error);
      setLoadError(true);
    }
  }, []);

  // ニュース＋ローカル掲載枠（自治体・観光PR）を1つのデータにまとめる
  useEffect(() => {
    if (!rawNews) return;
    const locals: NewsItem[] = config.placements
      .filter(p => p.type === 'local' && (!localRegion || p.region === localRegion))
      .map(p => ({ title: p.title, url: p.linkUrl || '', summary: p.description, summaryKind: 'ai', source: p.sponsor, placementId: p.id }));
    const data: NewsData = locals.length ? { local: locals, ...rawNews } : { ...rawNews };
    setNewsData(data);
    const first = categoriesOf(data)[0];
    if (first) setActiveCategory(prev => (localRegion && locals.length ? 'local' : listOf(data, prev).length ? prev : first));
  }, [rawNews, config, localRegion]);

  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  // 掲載枠の設定とプレミアム状態を読み込む（Stripe の支払い後は ?premium_session=… で戻ってくる）
  useEffect(() => {
    fetchConfig().then(setConfig);
    const params = new URLSearchParams(window.location.search);
    // 観光地・自治体のQRコード用：?local=地域名 でその地域のローカル情報を最初に表示
    if (params.get('local')) setLocalRegion(params.get('local')!.slice(0, 40));
    const session = params.get('premium_session');
    if (session) {
      claimStripe(session).then(r => {
        setPremium(r);
        showToast(r.active ? '⭐ プレミアムが有効になりました！' : r.error || '支払いを確認できませんでした');
      });
      params.delete('premium_session');
      const q = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : ''));
    } else {
      checkPremium().then(setPremium);
    }
  }, [showToast]);

  useEffect(() => {
    setCurrentUrl(window.location.href);
    const checkDevice = () => setShowQr(window.innerWidth > 1100);
    checkDevice();
    window.addEventListener('resize', checkDevice);
    try { if (localStorage.getItem('ns-muted') === '1') setMuted(true); } catch { /* noop */ }

    // 音声リストは非同期でロードされるブラウザがあるので両方で拾う
    const loadVoice = () => { voiceRef.current = pickJapaneseVoice(); };
    if ('speechSynthesis' in window) {
      loadVoice();
      window.speechSynthesis.addEventListener?.('voiceschanged', loadVoice);
    }
    fetchNews();

    const talk = talkRef.current;
    const stopOnHide = () => stopTalk(talk);
    window.addEventListener('pagehide', stopOnHide);
    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('pagehide', stopOnHide);
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
    const mv = viewerRef.current;
    if (mv && typeof mv.play === 'function') {
      try { mv.play(); } catch { /* モデル未ロード時は無視 */ }
    }
  }, [animation]);

  // ---------------- 読み上げ ----------------
  const endTalkUI = useCallback(() => {
    setSpeakingKey(null);
    setActiveSeg(-1);
    setAnimation(ANIM.idle);
  }, []);

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

  const readNews = useCallback((cat: string, item: NewsItem, opts: { auto?: boolean } = {}) => {
    const key = itemKey(cat, item);
    // 読み上げ中の同じニュースをもう一度タップ → 停止
    if (!opts.auto && speakingKeyRef.current === key) {
      stopAll();
      return;
    }

    const label = categoryMeta[cat]?.label || cat;
    const hasAiSummary = item.summaryKind === 'ai' && !!item.summary;
    setCurrent({ cat, item });
    setSummoned(null); // 3Dを表示中ならアバターに戻して読む
    if (chatForRef.current !== item.url) { chatForRef.current = item.url; setChat([]); }
    setBubble({ kind: 'news', label, title: item.title, sentences: hasAiSummary ? splitSentences(item.summary!) : [], source: item.source, loading: !hasAiSummary });
    setActiveSeg(-1);
    setSpeakingKey(key);
    setAnimation(ANIM.talk);

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
      if (!talk.alive()) return;
      const sentences = summary ? splitSentences(summary) : [];
      setBubble(b => ({ ...b, sentences, loading: false }));
      if (sentences.length) sentences.forEach((t, i) => talk.enqueue(t, i));
      else talk.enqueue('このニュースの中身を取得できませんでした。詳しくは記事ボタンからご覧ください。', -1);
      talk.ready(item.title.length + (summary?.length || 30));
    };

    // まずタイトルを読む（タップ直後に発話を始めることで iOS の自動再生制限も回避）
    talk.enqueue(`${label}のニュースです。${item.title}。`, -1);
    if (hasAiSummary) return deliver(item.summary);

    // 記事ページから作ったAI要約を取得（サーバー側でキャッシュされるので2回目以降は速い）
    const ctrl = new AbortController();
    const abortTimer = setTimeout(() => ctrl.abort(), 25000);
    fetch(`${API_BASE}/api/summary?url=${encodeURIComponent(item.url)}`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { summary?: string | null; summaryKind?: 'ai' | 'rss' } | null) => {
        if (d?.summary) {
          // 次回タップ時はすぐ読めるよう一覧のデータも更新
          setNewsData(prev => {
            if (!prev || !Array.isArray(prev[cat])) return prev;
            return { ...prev, [cat]: listOf(prev, cat).map(i => (i.url === item.url ? { ...i, summary: d.summary!, summaryKind: d.summaryKind } : i)) };
          });
        }
        deliver(d?.summary || item.summary);
      })
      .catch(() => deliver(item.summary))
      .finally(() => clearTimeout(abortTimer));
  }, [stopAll, endTalkUI, playStep]);
  readNewsRef.current = readNews;

  const explainCategory = (cat: string) => {
    const meta = categoryMeta[cat];
    const label = meta?.label || cat;
    const meaning = meta?.meaning || `${label}に関するニュースを集めたカテゴリです。`;
    const sentence = `「${label}」は、${meaning}`;
    stopAll();
    setBubble({ kind: 'category', label, title: `${label}ってどんなカテゴリ？`, sentences: [sentence] });
    setActiveSeg(-1);
    setSpeakingKey(`category::${cat}`);
    setAnimation(ANIM.talk);

    const talk = startTalk(talkRef.current, {
      muted: mutedRef.current,
      voice: voiceRef.current,
      onSeg: setActiveSeg,
      onDone: endTalkUI
    });
    talk.enqueue(sentence, 0);
    talk.ready(sentence.length);
  };

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
    if (speakingKeyRef.current || asking || summonedRef.current) return;
    setBubble(HINT_BUBBLE);
    setAnimation(ANIM.wave);
    if (waveTimer.current) clearTimeout(waveTimer.current);
    waveTimer.current = setTimeout(() => setAnimation(a => (a === ANIM.wave ? ANIM.idle : a)), 2200);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (next) window.speechSynthesis?.cancel();
    try { localStorage.setItem('ns-muted', next ? '1' : '0'); } catch { /* noop */ }
  };

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
        body: JSON.stringify({ question, url: summonedRef.current ? undefined : cur?.item.url, placement: summonedRef.current?.id, history }),
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
    const talk = startTalk(talkRef.current, {
      muted: mutedRef.current,
      voice: voiceRef.current,
      onSeg: setActiveSeg,
      onDone: () => { endTalkUI(); setAnswerTick(n => n + 1); }
    });
    sentences.forEach((s, i) => talk.enqueue(s, i));
    talk.ready(answer.length);
  };

  // ---------------- スポンサー／ローカルの3Dを呼び出す ----------------
  const placementOf = useCallback((item: NewsItem): Placement | undefined => {
    if (item.placementId) return config.placements.find(p => p.id === item.placementId);
    return sponsorFor(config.placements, `${item.title} ${item.summary || ''}`);
  }, [config]);

  const summon = (p: Placement) => {
    stopAll();
    setSummoned(p);
    track(p.type === 'sponsor' ? 'sponsor_open' : 'local_open', p.id, false);
    const sentences = splitSentences(p.description);
    setBubble({ kind: 'placement', label: p.type === 'sponsor' ? 'PR' : p.region || 'ローカル', title: p.title, sentences, source: p.sponsor, placement: p });
    const intro = p.type === 'sponsor' ? `${p.sponsor}の提供で、${p.title}を呼び出しました。` : `${p.region ? p.region + 'の' : ''}${p.title}を呼び出しました。`;
    setSpeakingKey(`placement::${p.id}`);
    setActiveSeg(-1);
    const talk = startTalk(talkRef.current, { muted: mutedRef.current, voice: voiceRef.current, onSeg: setActiveSeg, onDone: endTalkUI });
    talk.enqueue(intro, -1);
    sentences.forEach((t, i) => talk.enqueue(t, i));
    talk.ready(intro.length + p.description.length);
  };

  const unsummon = () => {
    stopAll();
    setSummoned(null);
    setBubble(HINT_BUBBLE);
  };

  // ---------------- エフェクト・AR写真 ----------------
  const chooseEffect = (id: EffectKind, color?: string) => {
    // 無料：なし／魔法陣（紫）。それ以外はプレミアム
    const free = id === 'none' || (id === 'magic' && (color || effectColor) === MAGIC_COLORS[0]);
    if (!free && !premium.active) { setPremiumOpen(true); return; }
    setEffect(id);
    if (color) setEffectColor(color);
  };

  const takePhoto = async () => {
    const viewer = viewerRef.current;
    if (!viewer?.toBlob || photoBusy) return;
    setPhotoBusy(true);
    try {
      const p = summonedRef.current;
      const caption = p ? `${p.title}${p.type === 'sponsor' ? `（PR・提供：${p.sponsor}）` : `（${p.sponsor}）`}` : currentRef.current?.item.title;
      const blob = await capturePhoto({
        viewer,
        video: reality && cameraState === 'on' ? videoRef.current : null,
        effect: effect !== 'none' ? effectRef.current : null,
        watermark: !premium.active,
        caption
      });
      track('photo', p?.id || 'avatar', false);
      const file = new File([blob], `news-summoner-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const nav: any = navigator;
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: 'News Summoner' }).catch(() => {});
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
      showToast(premium.active ? '📸 写真を保存しました' : '📸 写真を保存しました（ロゴなし保存はプレミアム）');
    } catch (e) {
      console.error(e);
      showToast('写真を作れませんでした');
    } finally {
      setPhotoBusy(false);
    }
  };

  // 床に置くAR（WebXR / Scene Viewer / Quick Look）。普段は使わないので「⋯」メニューの中に置く
  const openFloorAR = async () => {
    setMenuOpen(false);
    const mv = viewerRef.current;
    if (mv?.canActivateAR) {
      try { await mv.activateAR(); } catch { showToast('ARを起動できませんでした'); }
    } else {
      showToast('この端末・ブラウザでは床に置くARを使えません');
    }
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

  // 掲載枠の表示回数（スポンサー・自治体へのレポート用。1回の閲覧で1度だけ記録）
  useEffect(() => {
    listOf(newsData, activeCategory).forEach(item => {
      const p = placementOf(item);
      if (p) track(p.type === 'sponsor' ? 'sponsor_impression' : 'local_impression', p.id);
    });
  }, [newsData, activeCategory, placementOf]);

  // ---------------- 表示 ----------------
  const categories = categoriesOf(newsData);
  const items = listOf(newsData, activeCategory);
  const isTalking = speakingKey !== null;
  const overlayShown = reality || arActive;
  const currentTerms = current ? termsByUrl[current.item.url] || [] : [];
  const viewerSrc = summoned?.glbUrl || AVATAR_SRC;

  const renderBubble = () => (
    <div key={bubble.kind + bubble.title} className="ns-bubble" role="status" aria-live="polite">
      {bubble.kind === 'hint' ? (
        <div className="ns-bubble-hint">{bubble.title}</div>
      ) : (
        <>
          <span className="ns-bubble-label">
            {bubble.kind === 'answer' ? '💬 アバターの答え'
              : bubble.kind === 'category' ? '🗂 カテゴリの説明'
              : bubble.kind === 'placement' ? (bubble.placement?.type === 'sponsor' ? <><span className="ns-pr">PR</span> 提供：{bubble.placement?.sponsor}</> : `📍 ${bubble.placement?.region || bubble.placement?.sponsor}`)
              : `${bubble.label}のニュース`}
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
          {bubble.kind === 'placement' && bubble.placement?.linkUrl && (
            <a className="ns-ask-link ns-sponsor-link" href={bubble.placement.linkUrl} target="_blank" rel="noreferrer sponsored"
              onClick={() => track(bubble.placement!.type === 'sponsor' ? 'sponsor_link' : 'local_link', bubble.placement!.id, false)}>
              🔗 {bubble.placement.linkLabel || '詳しく見る'}
            </a>
          )}
          {!bubble.loading && bubble.kind !== 'category' && (
            <button className="ns-ask-link" onClick={openAsk}>
              💬 {bubble.kind === 'answer' ? '続けて話す' : bubble.kind === 'placement' ? 'これについて聞く' : 'わからない言葉を聞く'}
            </button>
          )}
        </>
      )}
    </div>
  );

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
      answerTick={answerTick}
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
            スマホで読み込むと、現実空間でアバターがニュースを読んでくれます。
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
          <div className="ns-head-right">
            {newsData?.last_updated && <span className="ns-updated">更新 {formatUpdated(newsData.last_updated)}</span>}
            <button className="ns-menu-btn" onClick={() => setMenuOpen(o => !o)} aria-label="メニュー" aria-expanded={menuOpen}>⋯</button>
          </div>
          {menuOpen && (
            <div className="ns-menu" role="menu" onClick={e => e.stopPropagation()}>
              {config.premium.enabled && (
                <button role="menuitem" onClick={() => { setMenuOpen(false); setPremiumOpen(true); }}>
                  ⭐ プレミアムパス{premium.active ? '（有効）' : ''}
                </button>
              )}
              <button role="menuitem" onClick={openFloorAR}>🕶 床に置くAR（実験的）</button>
              <a role="menuitem" href="/signage" target="_blank" rel="noreferrer">📺 サイネージ表示</a>
              {config.contactUrl && (
                <a role="menuitem" href={config.contactUrl} target="_blank" rel="noreferrer">🏢 3D掲載・導入のお問い合わせ</a>
              )}
            </div>
          )}
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
            {activeCategory && (
              <div className="ns-category-info">
                <span>{categoryMeta[activeCategory]?.meaning || `${categoryMeta[activeCategory]?.label || activeCategory}に関するニュースです。`}</span>
                <button className="ns-category-explain" onClick={() => explainCategory(activeCategory)}>
                  🤖 意味を聞く
                </button>
              </div>
            )}

            <div className="ns-list" role="list">
              {items.map(item => {
                const key = itemKey(activeCategory, item);
                const speaking = speakingKey === key;
                return (
                  <div key={key} role="listitem" className={`ns-item${speaking ? ' is-speaking' : ''}`}>
                    <button className="ns-item-main" onClick={() => readNews(activeCategory, item)}
                      aria-label={speaking ? `読み上げを停止：${item.title}` : `読み上げる：${item.title}`}>
                      <span className="ns-speak-icon" aria-hidden="true">
                        {speaking ? <span className="ns-bars"><i /><i /><i /></span> : '🔈'}
                      </span>
                      <span className="ns-title">{item.title}</span>
                    </button>
                    {(() => {
                      const p = placementOf(item);
                      return p ? (
                        <button className={`ns-3d-chip${p.type === 'sponsor' ? ' is-pr' : ''}`} onClick={() => summon(p)}
                          aria-label={`${p.title}の3Dを呼び出す${p.type === 'sponsor' ? `（PR・提供：${p.sponsor}）` : ''}`}>
                          🎁 3D{p.type === 'sponsor' && <small>PR</small>}
                        </button>
                      ) : null;
                    })()}
                    {item.url && <a className="ns-link" href={item.url} target="_blank" rel="noreferrer">🔗 {item.placementId ? '詳細' : '記事'}</a>}
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
          {renderBubble()}
          <div className="ns-bubble-tail" aria-hidden="true" />
        </div>

        <div className="ns-viewer-wrap">
          <EffectLayer ref={effectRef} effect={effect} color={effectColor} />
          <model-viewer
            ref={viewerRef}
            src={viewerSrc}
            alt={summoned ? `${summoned.title}の3Dモデル` : 'ニュースを読み上げるロボットのアバター'}
            ar=""
            ar-modes="webxr scene-viewer quick-look"
            ar-placement="floor"
            ar-scale={summoned?.realScale ? 'fixed' : 'auto'}
            camera-controls=""
            disable-zoom=""
            disable-pan=""
            touch-action="pan-y"
            interaction-prompt="none"
            camera-orbit={summoned ? undefined : reality ? '0deg 78deg 22m' : '0deg 80deg 14m'}
            camera-target={summoned ? undefined : reality ? '0m 3.6m 0m' : '0m 2.3m 0m'}
            field-of-view={summoned ? undefined : '30deg'}
            auto-rotate={summoned ? '' : undefined}
            shadow-intensity="1"
            exposure="1.1"
            autoplay=""
            animation-name={summoned ? undefined : animation}
            animation-crossfade-duration="300"
            onClick={greet}
          >
            {/* 床に置くARのボタンは隠し、「⋯」メニューから起動する */}
            <span slot="ar-button" style={{ display: 'none' }} />

            {/* 現実空間モード・AR中に表示するパネル（model-viewer の中に置くと WebXR の AR 中も表示される） */}
            <div className={`ns-overlay${overlayShown ? ' is-shown' : ''}`} onClick={e => e.stopPropagation()}>
              <div>
                {renderBubble()}
                {reality && cameraState === 'error' && (
                  <div className="ns-overlay-note">カメラを使えないため、背景なしで表示しています</div>
                )}
                {reality && cameraState === 'starting' && <div className="ns-overlay-note">カメラを起動しています…</div>}
              </div>
              <div className="ns-remote-extra">
                {summoned && <button className="ns-chip" onClick={unsummon}>← アバター</button>}
                <button className="ns-chip" onClick={() => setEffectOpen(o => !o)}>🎨 エフェクト</button>
                <button className="ns-chip" onClick={takePhoto} disabled={photoBusy}>{photoBusy ? '保存中…' : '📸 撮影'}</button>
              </div>
              <div className="ns-remote" role="toolbar" aria-label="ニュースの操作">
                <button onClick={() => playStep(-1)} aria-label="前のニュース" disabled={!newsData}>⏮</button>
                <button className="is-main" onClick={toggleAutoPlay} aria-label={autoPlay ? '連続再生を止める' : 'ニュースを連続で読む'} disabled={!newsData}>
                  {autoPlay ? '⏸' : '▶'}
                </button>
                <button onClick={() => playStep(1)} aria-label="次のニュース" disabled={!newsData}>⏭</button>
                <button onClick={openAsk} aria-label="アバターと話す">💬</button>
                <button onClick={toggleMute} aria-label={muted ? '音声をオンにする' : '音声をオフにする'}>{muted ? '🔇' : '🔊'}</button>
                {reality && !arActive && <button className="ns-remote-exit" onClick={() => { stopAll(); exitReality(); }}>終了</button>}
              </div>
            </div>
            {arActive && askSheet}
          </model-viewer>

          <div className="ns-controls">
            <button className="ns-chip" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? '音声をオンにする' : '音声をオフにする'}>
              {muted ? '🔇' : '🔊'}
            </button>
            {summoned ? (
              <button className="ns-chip" onClick={unsummon}>← アバター</button>
            ) : isTalking || autoPlay ? (
              <button className="ns-chip" onClick={stopAll}>⏹ 停止</button>
            ) : (
              <button className="ns-chip" onClick={toggleAutoPlay} disabled={!newsData}>▶ 連続再生</button>
            )}
            <button className="ns-chip" onClick={openAsk}>💬 話す</button>
            <button className="ns-chip" onClick={() => setEffectOpen(o => !o)} aria-label="エフェクト" aria-expanded={effectOpen}>🎨</button>
            {summoned && <button className="ns-chip" onClick={takePhoto} disabled={photoBusy} aria-label="写真を撮る">📸</button>}
            <button className="ns-chip ns-chip-primary" onClick={enterReality}>📷 現実空間</button>
          </div>
        </div>
      </section>

      {effectOpen && (
        <div className="ns-fx-panel" role="dialog" aria-label="エフェクト">
          <div className="ns-fx-head">
            <b>🎨 エフェクト</b>
            {!premium.active && <button className="ns-fx-premium" onClick={() => setPremiumOpen(true)}>⭐ プレミアムで全部使える</button>}
            <button className="ask-close" onClick={() => setEffectOpen(false)} aria-label="閉じる">✕</button>
          </div>
          <div className="ns-fx-list">
            {EFFECTS.map(e => {
              const locked = !premium.active && e.id !== 'none' && e.id !== 'magic';
              return (
                <button key={e.id} className={`ns-fx${effect === e.id ? ' is-on' : ''}`} onClick={() => chooseEffect(e.id)}>
                  <span>{e.icon}</span>{e.label}{locked && <small>⭐</small>}
                </button>
              );
            })}
          </div>
          {effect === 'magic' && (
            <div className="ns-fx-colors">
              {MAGIC_COLORS.map((c, i) => (
                <button key={c} className={`ns-fx-color${effectColor === c ? ' is-on' : ''}`} style={{ background: c }}
                  onClick={() => chooseEffect('magic', c)} aria-label={`魔法陣の色 ${i + 1}${i > 0 && !premium.active ? '（プレミアム）' : ''}`}>
                  {i > 0 && !premium.active ? '⭐' : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!arActive && askSheet}
      <PremiumSheet open={premiumOpen} onClose={() => setPremiumOpen(false)} config={config} premium={premium}
        onActivated={setPremium} />
      {toast && <div className="ns-toast" role="status">{toast}</div>}
      {menuOpen && <div className="ns-menu-backdrop" onClick={() => setMenuOpen(false)} />}
    </div>
  );
}
