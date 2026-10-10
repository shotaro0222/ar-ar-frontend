'use client';

import React, { useEffect, useRef, useState } from 'react';
import { getRecognition, recognitionSupported } from '../lib/speech';

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

type Props = {
  open: boolean;
  onClose: () => void;
  newsTitle?: string;
  terms: string[];
  termsLoading: boolean;
  messages: ChatTurn[];
  busy: boolean;
  onSend: (question: string) => void;
  onBeforeListen: () => void;
  /** アバターが答えを読み終えるたびに増える。ハンズフリー会話中はこれを合図に次を聞き取る */
  answerTick?: number;
};

// わからない言葉をアバターに質問する画面（下から出るシート）
export default function AskSheet({ open, onClose, newsTitle, terms, termsLoading, messages, busy, onSend, onBeforeListen, answerTick = 0 }: Props) {
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState('');
  const [canListen, setCanListen] = useState(false);
  const [handsFree, setHandsFree] = useState(false); // 話しかけ続けられる会話モード
  const recRef = useRef<any>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setCanListen(recognitionSupported()); }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) {
      try { recRef.current?.abort(); } catch { /* noop */ }
      setListening(false);
    }
  }, [open]);

  // ハンズフリー：答えを読み終えたら自動でマイクを開く
  const toggleMicRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (open && handsFree && answerTick > 0) toggleMicRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerTick]);

  const send = (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    onSend(text);
    setInput('');
  };

  const toggleMic = () => {
    if (listening) {
      try { recRef.current?.stop(); } catch { /* noop */ }
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    onBeforeListen(); // 読み上げの声をマイクが拾わないように止める
    setMicError('');
    let finalText = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      setInput(finalText + interim);
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setMicError('マイクの使用が許可されていません');
      else if (e.error !== 'aborted' && e.error !== 'no-speech') setMicError('うまく聞き取れませんでした');
    };
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) send(finalText);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setMicError('マイクを開始できませんでした');
    }
  };

  toggleMicRef.current = () => { if (!listening) toggleMic(); };

  if (!open) return null;

  return (
    <div className="ask-backdrop" onClick={onClose}>
      <div className="ask-sheet" role="dialog" aria-label="ニュースについて質問" onClick={e => e.stopPropagation()}>
        <div className="ask-head">
          <div>
            <div className="ask-title">💬 アバターと話そう</div>
            {newsTitle && <div className="ask-context">いまのニュース：{newsTitle}</div>}
          </div>
          <button className="ask-close" onClick={onClose} aria-label="閉じる">✕</button>
        </div>

        {canListen && (
          <label className="ask-handsfree">
            <input type="checkbox" checked={handsFree} onChange={e => { setHandsFree(e.target.checked); if (e.target.checked && !busy) toggleMic(); }} />
            🎙 会話モード（答えのあと自動で聞き取ります）
          </label>
        )}

        {newsTitle && (
          <div className="ask-terms">
            {termsLoading && <span className="ask-terms-note">気になりそうな言葉を探しています…</span>}
            {!termsLoading && terms.map(t => (
              <button key={t} className="ask-term" disabled={busy} onClick={() => send(`「${t}」ってなに？`)}>
                {t}ってなに？
              </button>
            ))}
            {!termsLoading && (
              <button className="ask-term" disabled={busy} onClick={() => send('このニュースをもっとかんたんに教えて')}>
                もっとかんたんに
              </button>
            )}
          </div>
        )}

        <div className="ask-log" ref={logRef}>
          {messages.length === 0 && !busy && (
            <div className="ask-empty">
              ニュースに出てきた言葉、わからなかったこと、なんでも話しかけてね。ボクが声で答えるよ。
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`ask-msg ask-${m.role}`}>{m.content}</div>
          ))}
          {busy && <div className="ask-msg ask-assistant ask-typing">考えています<span className="ns-dots"><i>.</i><i>.</i><i>.</i></span></div>}
        </div>

        {micError && <div className="ask-error">{micError}</div>}

        <form className="ask-form" onSubmit={e => { e.preventDefault(); send(input); }}>
          {canListen && (
            <button type="button" className={`ask-mic${listening ? ' is-on' : ''}`} onClick={toggleMic}
              aria-label={listening ? '音声入力を止める' : '声で質問する'}>
              {listening ? '⏺' : '🎤'}
            </button>
          )}
          <input
            className="ask-input"
            value={input}
            maxLength={200}
            onChange={e => setInput(e.target.value)}
            placeholder={listening ? '聞いています…' : '例：DXってなに？'}
            enterKeyHint="send"
          />
          <button type="submit" className="ask-send" disabled={!input.trim() || busy}>送信</button>
        </form>
      </div>
    </div>
  );
}
