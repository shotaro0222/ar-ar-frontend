'use client';

// 提携メディア向け XR ウィジェット：/widget?partner=提携ID&url=記事URL
// 記事ページに貼った widget.js がこの画面をポップアップ（iframe）で開く。
// アバターが記事の要約を読み上げ、わからない言葉は会話で聞ける。

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useSearchParams } from 'next/navigation';
import AskSheet, { ChatTurn } from '../components/AskSheet';
import { API_BASE, track } from '../lib/api';
import { pickJapaneseVoice, splitSentences, startTalk, stopTalk, TalkHolder } from '../lib/speech';

const AVATAR_SRC = '/models/RobotExpressive.glb';
const ANIM = { idle: 'Idle', talk: 'Yes', think: 'Standing' };

type Article = { url: string; title: string; summary: string | null; source?: string };

function WidgetInner() {
  const params = useSearchParams();
  const partner = params.get('partner') || '';
  const articleUrl = params.get('url') || '';

  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState('');
  const [sentences, setSentences] = useState<string[]>([]);
  const [heading, setHeading] = useState('');
  const [seg, setSeg] = useState(-1);
  const [speaking, setSpeaking] = useState(false);
  const [anim, setAnim] = useState(ANIM.idle);
  const [askOpen, setAskOpen] = useState(false);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [asking, setAsking] = useState(false);
  const [answerTick, setAnswerTick] = useState(0);

  const talkRef = useRef<TalkHolder>({ session: null, timer: null, utterances: [] });
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const viewerRef = useRef<any>(null);

  useEffect(() => {
    const loadVoice = () => { voiceRef.current = pickJapaneseVoice(); };
    loadVoice();
    window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoice);
    const talk = talkRef.current;
    if (!partner || !articleUrl) { setError('ウィジェットの設定が正しくありません'); return; }
    fetch(`${API_BASE}/api/embed/summary?partner=${encodeURIComponent(partner)}&url=${encodeURIComponent(articleUrl)}`)
      .then(async r => {
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(d?.error === 'domain not allowed' ? 'このサイトではウィジェットを利用できません' : 'ウィジェットを利用できません');
        setArticle(d);
        setHeading(d.title || 'この記事');
        setSentences(d.summary ? splitSentences(d.summary) : []);
      })
      .catch(e => setError(e.message || '記事を読み込めませんでした'));
    return () => { stopTalk(talk); window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoice); };
  }, [partner, articleUrl]);

  useEffect(() => {
    const mv = viewerRef.current;
    if (mv?.play) try { mv.play(); } catch { /* noop */ }
  }, [anim]);

  const done = () => { setSpeaking(false); setSeg(-1); setAnim(ANIM.idle); };

  const speakLines = (lines: { text: string; seg: number }[], onDone = done) => {
    setSpeaking(true);
    setAnim(ANIM.talk);
    const talk = startTalk(talkRef.current, { muted: false, voice: voiceRef.current, onSeg: setSeg, onDone });
    lines.forEach(l => talk.enqueue(l.text, l.seg));
    talk.ready(lines.reduce((n, l) => n + l.text.length, 0));
  };

  const play = () => {
    if (speaking) { stopTalk(talkRef.current); done(); return; }
    if (!article?.summary) return;
    const ss = splitSentences(article.summary);
    setHeading(article.title || 'この記事');
    setSentences(ss);
    track('embed_play', partner, false);
    speakLines([{ text: `${article.title}。`, seg: -1 }, ...ss.map((text, i) => ({ text, seg: i }))]);
  };

  const ask = async (question: string) => {
    stopTalk(talkRef.current);
    const history = chat;
    setChat(c => [...c, { role: 'user', content: question }]);
    setAsking(true);
    setAnim(ANIM.think);
    let answer = '';
    try {
      const res = await fetch(`${API_BASE}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, url: article?.url || articleUrl, history })
      });
      answer = (await res.json())?.answer || '';
    } catch { /* noop */ }
    if (!answer) answer = 'ごめんなさい、いまは答えを用意できませんでした。';
    setAsking(false);
    setChat(c => [...c, { role: 'assistant', content: answer }]);
    const ss = splitSentences(answer);
    setHeading(`Q. ${question}`);
    setSentences(ss);
    speakLines(ss.map((text, i) => ({ text, seg: i })), () => { done(); setAnswerTick(n => n + 1); });
  };

  return (
    <div className="wg-root">
      <Script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js" />
      <header className="wg-head">
        <span>🔮 News Summoner</span>
        {article?.source && <small>{article.source} × News Summoner</small>}
      </header>

      <div className="wg-bubble ns-bubble" role="status" aria-live="polite">
        {error ? (
          <div className="ns-bubble-hint">{error}</div>
        ) : !article ? (
          <p className="ns-bubble-summary ns-loading">記事を読み込んでいます<span className="ns-dots"><i>.</i><i>.</i><i>.</i></span></p>
        ) : (
          <>
            <div className={`ns-bubble-title${speaking && seg === -1 ? ' is-reading' : ''}`}>{heading}</div>
            <p className="ns-bubble-summary">
              {sentences.length
                ? sentences.map((t, i) => <span key={i} className={speaking && seg === i ? 'is-reading' : undefined}>{t}</span>)
                : 'この記事の要約を作れませんでした。'}
            </p>
          </>
        )}
      </div>
      <div className="ns-bubble-tail" aria-hidden="true" />

      <div className="wg-stage">
        <model-viewer
          ref={viewerRef}
          src={AVATAR_SRC}
          alt="記事を読み上げるロボットのアバター"
          camera-controls=""
          disable-zoom=""
          disable-pan=""
          interaction-prompt="none"
          camera-orbit="0deg 80deg 14m"
          camera-target="0m 2.3m 0m"
          field-of-view="30deg"
          shadow-intensity="1"
          exposure="1.1"
          autoplay=""
          animation-name={anim}
          animation-crossfade-duration="300"
        />
      </div>

      <div className="wg-actions">
        <button className="ns-chip ns-chip-primary" onClick={play} disabled={!article?.summary}>
          {speaking ? '⏹ 止める' : '▶ 読み上げる'}
        </button>
        <button className="ns-chip" onClick={() => setAskOpen(true)} disabled={!article}>💬 話す</button>
        <a className="ns-chip" href="/" target="_blank" rel="noreferrer">ほかのニュース</a>
      </div>

      <AskSheet
        open={askOpen}
        onClose={() => setAskOpen(false)}
        newsTitle={article?.title}
        terms={[]}
        termsLoading={false}
        messages={chat}
        busy={asking}
        onSend={ask}
        onBeforeListen={() => { stopTalk(talkRef.current); done(); }}
        answerTick={answerTick}
      />
    </div>
  );
}

export default function WidgetPage() {
  return (
    <Suspense fallback={null}>
      <WidgetInner />
    </Suspense>
  );
}
