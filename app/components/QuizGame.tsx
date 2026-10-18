'use client';

// 終わらないニュースクイズ
// - play：タップで答える（スマホ・タッチ対応サイネージ）。ライフ3・レベルが上がると制限時間が短くなる・連続正解ボーナス・日別ランキング
// - auto：タッチできないサイネージ用。問題 → カウントダウン → 正解発表 を自動で繰り返す（スマホで参加はQRから）

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../lib/api';
import { trackEvent } from '../lib/analytics';

type Quiz = { q: string; choices: string[]; answer: number; explain?: string; source?: string; url?: string; kind: string };
type Rank = { name: string; score: number };

type Props = {
  scope: string; // ランキングの単位（web または サイネージ端末ID）
  mode: 'play' | 'auto';
  big?: boolean;
  kiosk?: boolean; // キーボードのない端末：名前は候補から選ぶ
  onSpeak?: (text: string) => void; // サイネージでアバターに読ませる
};

const CAT_LABELS: Record<string, string> = {
  it: 'IT', business: 'ビジネス', entertainment: 'エンタメ', funny: 'オモシロ', politics: '政治', society: '社会',
  world: '国際', sports: 'スポーツ', science: '科学', lifestyle: '暮らし'
};
const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// クイズAPIが使えないとき用：ニュース一覧から「このニュースはどのジャンル？」を作る
async function fallbackQuizzes(n: number): Promise<Quiz[]> {
  const news = await fetch(`${API_BASE}/api/news`).then(r => r.json());
  const cats = Object.keys(news || {}).filter(k => CAT_LABELS[k] && Array.isArray(news[k]) && news[k].length);
  if (cats.length < 2) return [];
  const out: Quiz[] = [];
  for (let i = 0; i < n; i++) {
    const cat = cats[Math.floor(Math.random() * cats.length)];
    const item = news[cat][Math.floor(Math.random() * news[cat].length)];
    const others = shuffle(Object.keys(CAT_LABELS).filter(c => c !== cat)).slice(0, 3);
    const choices = shuffle([cat, ...others]).map(c => CAT_LABELS[c]);
    out.push({ q: `このニュースはどのジャンル？「${item.title}」`, choices, answer: choices.indexOf(CAT_LABELS[cat]), source: item.source, url: item.url, kind: 'category' });
  }
  return out;
}

const KIOSK_NAMES = ['ねこ🐱', 'いぬ🐶', 'うさぎ🐰', 'ぱんだ🐼', 'ぺんぎん🐧', 'くま🐻', 'きつね🦊', 'とら🐯'];
const LEVEL_UP = 5;

export default function QuizGame({ scope, mode, big, kiosk, onSpeak }: Props) {
  const [queue, setQueue] = useState<Quiz[]>([]);
  const [cur, setCur] = useState<Quiz | null>(null);
  const [phase, setPhase] = useState<'title' | 'question' | 'reveal' | 'over' | 'ranked'>(mode === 'auto' ? 'question' : 'title');
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [streak, setStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [top, setTop] = useState<Rank[]>([]);
  const [name, setName] = useState('');
  const [rank, setRank] = useState<number | null>(null);
  const [gain, setGain] = useState(0);
  const loading = useRef(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const waitTries = useRef(0);
  const queueRef = useRef<Quiz[]>([]);
  queueRef.current = queue;

  const level = Math.floor(correct / LEVEL_UP) + 1;
  const limit = mode === 'auto' ? 12 : Math.max(8, 21 - level * 2);

  const refill = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    let list: Quiz[] = [];
    try {
      const r = await fetch(`${API_BASE}/api/quiz?n=15`);
      if (r.ok) list = ((await r.json()).quizzes || []).filter((x: Quiz) => x?.q && x.choices?.length === 4);
    } catch { /* 下の代わりの問題で補う */ }
    if (!list.length) {
      try { list = await fallbackQuizzes(15); } catch { /* 通信できない */ }
    }
    if (list.length) { setQueue(q => [...q, ...list]); setLoadFailed(false); } else setLoadFailed(true);
    loading.current = false;
  }, []);

  const loadTop = useCallback(() => {
    fetch(`${API_BASE}/api/quiz/leaderboard?scope=${encodeURIComponent(scope)}`).then(r => r.json()).then(d => setTop(d.top || [])).catch(() => {});
  }, [scope]);

  useEffect(() => { refill(); loadTop(); }, [refill, loadTop]);
  useEffect(() => { if (queue.length < 5) refill(); }, [queue.length, refill]);

  const nextQuestion = useCallback(() => {
    const [q, ...rest] = queueRef.current;
    if (!q) {
      // 問題がまだ届いていない：読み込み中を表示して待つ（10回=約15秒であきらめてエラー表示）
      setCur(null);
      setPhase('question');
      if (waitTries.current++ < 10) { refill(); setTimeout(() => nextRef.current(), 1500); } else setLoadFailed(true);
      return;
    }
    waitTries.current = 0;
    setQueue(rest);
    setCur(q);
    setPicked(null);
    setPhase('question');
    setTimeLeft(mode === 'auto' ? 12 : Math.max(8, 21 - (Math.floor(correct / LEVEL_UP) + 1) * 2));
    onSpeak?.(q.q);
  }, [mode, correct, refill, onSpeak]);
  const nextRef = useRef(nextQuestion);
  nextRef.current = nextQuestion;

  // auto モードは最初から始める
  useEffect(() => { if (mode === 'auto' && !cur && queue.length) nextRef.current(); }, [mode, cur, queue.length]);

  // タイマー
  useEffect(() => {
    if (phase !== 'question' || !cur) return;
    if (timeLeft <= 0) { answer(-1); return; }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft, cur]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (i: number) => {
    if (!cur || phase !== 'question') return;
    setPicked(i);
    setPhase('reveal');
    const ok = i === cur.answer;
    if (mode === 'auto') {
      onSpeak?.(`正解は、${cur.choices[cur.answer]}。${cur.explain || ''}`);
      setTimeout(() => nextRef.current(), 7000);
      return;
    }
    if (ok) {
      const pts = Math.round((100 + timeLeft * 10) * (1 + streak * 0.1));
      setGain(pts);
      setScore(s => s + pts);
      setStreak(s => s + 1);
      setCorrect(c => c + 1);
    } else {
      setGain(0);
      setStreak(0);
      setLives(l => l - 1);
    }
  };

  const afterReveal = () => {
    if (lives <= 0) { setPhase('over'); trackEvent('quiz_game_over', { score, level }); return; }
    nextQuestion();
  };

  const start = () => {
    setScore(0); setLives(3); setStreak(0); setCorrect(0); setRank(null);
    setLoadFailed(false);
    waitTries.current = 0;
    trackEvent('quiz_start', { scope });
    nextQuestion();
  };

  const submitScore = async (n: string) => {
    setName(n);
    try {
      const d = await fetch(`${API_BASE}/api/quiz/score`, { method: 'POST', body: JSON.stringify({ name: n, score, scope }) }).then(r => r.json());
      setTop(d.top || []);
      setRank(d.rank || null);
      try { localStorage.setItem('ns-quiz-name', n); } catch { /* noop */ }
    } catch { /* noop */ }
    setPhase('ranked');
  };

  useEffect(() => { try { setName(localStorage.getItem('ns-quiz-name') || ''); } catch { /* noop */ } }, []);

  const cls = `qz${big ? ' qz-big' : ''}${mode === 'auto' ? ' qz-auto' : ''}`;

  if (phase === 'title') {
    return (
      <div className={cls}>
        <div className="qz-title">
          <div className="qz-logo">🎮</div>
          <h2>ニュースクイズ</h2>
          <p>今日のニュースから出題！ライフは3つ。連続正解でボーナス、レベルが上がるほど制限時間が短くなります。</p>
          <button className="qz-btn" onClick={start}>スタート</button>
          <Ranking top={top} />
        </div>
      </div>
    );
  }

  if (phase === 'over' || phase === 'ranked') {
    return (
      <div className={cls}>
        <div className="qz-title">
          <h2>ゲームオーバー</h2>
          <div className="qz-final">{score.toLocaleString()} <small>点</small></div>
          <p>レベル {level}・正解 {correct} 問</p>
          {phase === 'over' ? (
            kiosk ? (
              <div className="qz-names">
                <p>ランキングに登録する名前をえらんでね</p>
                {KIOSK_NAMES.map(n => <button key={n} className="qz-name" onClick={() => submitScore(n)}>{n}</button>)}
              </div>
            ) : (
              <form className="qz-form" onSubmit={e => { e.preventDefault(); submitScore(name || 'ななしさん'); }}>
                <input value={name} onChange={e => setName(e.target.value)} maxLength={12} placeholder="ニックネーム（12文字まで）" />
                <button className="qz-btn" type="submit">ランキングに登録</button>
              </form>
            )
          ) : (
            <p className="qz-rank">{rank ? `今日の ${rank} 位にランクイン！` : 'ランキング入りならず…もう一度挑戦！'}</p>
          )}
          <button className="qz-btn qz-sub" onClick={start}>もう一度あそぶ</button>
          <Ranking top={top} />
        </div>
      </div>
    );
  }

  if (!cur) {
    return (
      <div className={cls}>
        <div className="qz-title">
          {loadFailed ? (
            <>
              <p>問題を読み込めませんでした。通信状態を確認してください。</p>
              <button className="qz-btn" onClick={() => { setLoadFailed(false); waitTries.current = 0; refill(); setTimeout(() => nextRef.current(), 800); }}>もう一度読み込む</button>
            </>
          ) : <p>問題を準備しています…</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={cls}>
      {mode === 'play' && (
        <div className="qz-hud">
          <span>❤️ {'●'.repeat(Math.max(0, lives))}{'○'.repeat(Math.max(0, 3 - lives))}</span>
          <span>Lv.{level}</span>
          <span>{streak >= 2 ? `🔥${streak}連続` : ''}</span>
          <b>{score.toLocaleString()}点</b>
        </div>
      )}
      <div className="qz-timer"><i style={{ width: `${(timeLeft / limit) * 100}%` }} /></div>
      <div className="qz-q">
        <div className="qz-kind">{cur.kind === 'category' ? '🗂 ジャンル当て' : '📰 ニュースクイズ'}{mode === 'auto' && phase === 'question' && ` ・ あと${timeLeft}秒`}</div>
        <h2>{cur.q}</h2>
      </div>
      <div className="qz-choices">
        {cur.choices.map((c, i) => {
          const state = phase === 'reveal' ? (i === cur.answer ? ' is-correct' : i === picked ? ' is-wrong' : ' is-dim') : '';
          return (
            <button key={i} className={`qz-choice${state}`} onClick={() => answer(i)} disabled={mode === 'auto' || phase !== 'question'}>
              <span className="qz-mark">{'ABCD'[i]}</span>{c}
            </button>
          );
        })}
      </div>
      {phase === 'reveal' && (
        <div className="qz-reveal">
          <b>{mode === 'auto' ? `正解は「${cur.choices[cur.answer]}」` : picked === cur.answer ? `⭕ 正解！ +${gain}点` : picked === -1 ? '⏰ 時間切れ' : '❌ ざんねん'}</b>
          {cur.explain && <p>{cur.explain}</p>}
          {cur.source && <small>出典：{cur.source}</small>}
          {mode === 'play' && <button className="qz-btn" onClick={afterReveal}>{lives <= 0 ? '結果を見る' : '次の問題 →'}</button>}
        </div>
      )}
    </div>
  );
}

function Ranking({ top }: { top: Rank[] }) {
  if (!top.length) return null;
  return (
    <div className="qz-ranking">
      <b>🏆 今日のランキング</b>
      <ol>{top.slice(0, 5).map((t, i) => <li key={i}><span>{t.name}</span><b>{t.score.toLocaleString()}</b></li>)}</ol>
    </div>
  );
}
