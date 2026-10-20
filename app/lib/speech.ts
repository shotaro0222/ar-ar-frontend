// 読み上げ（音声合成）と音声入力（音声認識）のヘルパー

import { API_BASE } from './api';

// 読み上げ用に文単位で分割（長すぎる文は読点で分ける）
export function splitSentences(text: string): string[] {
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

export function pickJapaneseVoice(): SpeechSynthesisVoice | null {
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

export type TalkHolder = {
  session: object | null;
  timer: ReturnType<typeof setTimeout> | null;
  utterances: SpeechSynthesisUtterance[]; // GCで発話が消えるChromeの不具合対策に参照を保持
};

export type TalkSession = {
  /** 1文を読み上げキューに追加（seg は吹き出しでハイライトする文の番号） */
  enqueue(text: string, seg: number): void;
  /** これ以上追加する文がないことを知らせる。読み終わったら onDone が呼ばれる */
  ready(totalLength: number): void;
  alive(): boolean;
};

// ---------- ElevenLabs の声（バックエンド /api/tts 経由。キーはサーバー側だけに置く） ----------
// 使えないとき（未設定・上限・通信エラー・自動再生の制限）はブラウザの読み上げに切り替える
let ttsEnabled: boolean | null = null; // null = 確認中
let ttsChecking = false;
let ttsFailures = 0;
let sharedAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
const audioCache = new Map<string, string>(); // 文章 → objectURL（サイネージで同じ文を繰り返すとき用）

function checkTts() {
  if (ttsChecking || typeof window === 'undefined') return;
  ttsChecking = true;
  fetch(`${API_BASE}/api/tts/status`)
    .then(r => (r.ok ? r.json() : { enabled: false }))
    .then(d => { ttsEnabled = !!d?.enabled; })
    .catch(() => { ttsEnabled = false; });
}

const useEleven = () => ttsEnabled === true && ttsFailures < 3 && typeof Audio !== 'undefined';

function audioEl(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
    (sharedAudio as any).playsInline = true;
  }
  return sharedAudio;
}

// 無音の WAV（iOS などで、タップの瞬間に一度再生しておくと以降の再生が許可される）
function silentWav(): string {
  const n = 800;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  let bin = '';
  new Uint8Array(buf).forEach(b => { bin += String.fromCharCode(b); });
  return `data:audio/wav;base64,${btoa(bin)}`;
}

function unlockAudio() {
  if (audioUnlocked || typeof window === 'undefined' || typeof Audio === 'undefined') return;
  const a = audioEl();
  try {
    a.src = silentWav();
    const p = a.play();
    audioUnlocked = true;
    p?.catch(() => { audioUnlocked = false; });
  } catch { /* noop */ }
}

if (typeof window !== 'undefined') {
  checkTts();
  const onFirst = () => { if (ttsEnabled !== false) unlockAudio(); };
  window.addEventListener('pointerdown', onFirst, { once: true, capture: true });
  window.addEventListener('keydown', onFirst, { once: true, capture: true });
}

async function fetchVoice(text: string): Promise<string | null> {
  const hit = audioCache.get(text);
  if (hit) return hit;
  try {
    const r = await fetch(`${API_BASE}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('audio')) {
      if (r.status === 503 || r.status === 403) ttsEnabled = false; // 無効化・許可されていない場所では以後ブラウザの声
      else ttsFailures++;
      return null;
    }
    const url = URL.createObjectURL(await r.blob());
    audioCache.set(text, url);
    if (audioCache.size > 80) {
      const [k, old] = audioCache.entries().next().value as [string, string];
      audioCache.delete(k);
      URL.revokeObjectURL(old);
    }
    ttsFailures = 0;
    return url;
  } catch {
    ttsFailures++;
    return null;
  }
}

/** 読み上げ中の音声を止める（ミュート切り替えなど） */
export function silenceVoice() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  if (sharedAudio) {
    sharedAudio.onended = null;
    sharedAudio.onerror = null;
    sharedAudio.pause();
  }
}

export function stopTalk(holder: TalkHolder) {
  silenceVoice();
  if (holder.timer) clearTimeout(holder.timer);
  holder.timer = null;
  holder.session = null;
  holder.utterances = [];
}

/**
 * 新しい読み上げを始める（前の読み上げは止める）。
 * ElevenLabs が使えるときはその声で、使えないときはブラウザの音声で読む。
 * 音声が使えないとき（ミュート・非対応・エラー）は、文字数に応じた時間だけ待ってから onDone を呼ぶ。
 */
export function startTalk(
  holder: TalkHolder,
  opts: { muted: boolean; voice: SpeechSynthesisVoice | null; onSeg: (seg: number) => void; onDone: () => void }
): TalkSession {
  stopTalk(holder);
  const session = {};
  holder.session = session;
  const alive = () => holder.session === session;

  const finish = () => {
    if (!alive()) return;
    if (holder.timer) clearTimeout(holder.timer);
    holder.timer = null;
    holder.session = null;
    holder.utterances = [];
    opts.onDone();
  };

  const browser = browserTalk(holder, opts, alive, finish);
  if (opts.muted || !useEleven()) return browser;

  // ---- ElevenLabs：文ごとに音声を先読みし、順番に再生する ----
  unlockAudio(); // タップから呼ばれたときに再生の許可を取っておく
  type Item = { text: string; seg: number; url: Promise<string | null> };
  const queue: Item[] = [];
  let playing = false;
  let fallen = false; // 途中でブラウザの声に切り替えたか
  let isReady = false;
  let totalLen = 0;

  const fallback = (from: Item[]) => {
    fallen = true;
    silenceVoice();
    for (const it of from) browser.enqueue(it.text, it.seg);
    if (isReady) browser.ready(totalLen);
  };

  const pump = async () => {
    if (playing || !alive() || fallen) return;
    const it = queue[0];
    if (!it) {
      if (isReady) finish();
      return;
    }
    playing = true;
    const url = await it.url;
    if (!alive() || fallen) return;
    if (!url) { playing = false; fallback(queue.splice(0)); return; }
    const a = audioEl();
    a.onended = () => {
      if (!alive()) return;
      queue.shift();
      playing = false;
      pump();
    };
    a.onerror = () => { if (alive()) { playing = false; fallback(queue.splice(0)); } };
    a.src = url;
    opts.onSeg(it.seg);
    a.play().catch(() => {
      // 自動再生が許可されていない（タップなしで始まった）ときはブラウザの声で
      if (alive() && !fallen) { playing = false; fallback(queue.splice(0)); }
    });
  };

  return {
    alive,
    enqueue(text, seg) {
      if (!alive()) return;
      if (fallen) return browser.enqueue(text, seg);
      queue.push({ text, seg, url: fetchVoice(text) });
      pump();
    },
    ready(totalLength) {
      if (!alive()) return;
      isReady = true;
      totalLen = totalLength;
      if (fallen) return browser.ready(totalLength);
      // 再生が止まってしまったときの保険
      if (holder.timer) clearTimeout(holder.timer);
      holder.timer = setTimeout(finish, Math.max(20000, totalLength * 600));
      if (!playing && !queue.length) finish();
    }
  };
}

// ブラウザの音声合成（speechSynthesis）での読み上げ
function browserTalk(
  holder: TalkHolder,
  opts: { muted: boolean; voice: SpeechSynthesisVoice | null; onSeg: (seg: number) => void },
  alive: () => boolean,
  finish: () => void
): TalkSession {
  const synth = !opts.muted && typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  let outstanding = 0;
  let isReady = false;
  let broken = !synth;
  let totalLen = 0;

  const silentFinish = () => {
    if (holder.timer) clearTimeout(holder.timer);
    holder.timer = setTimeout(finish, Math.min(25000, Math.max(3000, totalLen * 150)));
  };
  const maybeFinish = () => {
    if (alive() && isReady && outstanding === 0 && !broken) finish();
  };

  return {
    alive,
    enqueue(text, seg) {
      if (!synth || broken || !alive()) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 1.05;
      u.pitch = 1.1;
      if (opts.voice) u.voice = opts.voice;
      outstanding++;
      u.onstart = () => { if (alive()) opts.onSeg(seg); };
      u.onend = () => { if (!alive()) return; outstanding--; maybeFinish(); };
      u.onerror = e => {
        if (!alive()) return;
        if (e.error === 'interrupted' || e.error === 'canceled') { outstanding--; return; }
        broken = true;
        synth.cancel();
        if (isReady) silentFinish();
      };
      holder.utterances.push(u);
      synth.speak(u);
    },
    ready(totalLength) {
      if (!alive()) return;
      isReady = true;
      totalLen = totalLength;
      if (broken) return silentFinish();
      // 一部ブラウザで onend が来ないケースの保険
      if (holder.timer) clearTimeout(holder.timer);
      holder.timer = setTimeout(finish, Math.max(15000, totalLength * 450));
      maybeFinish();
    }
  };
}

// ---------- 音声認識（マイクで質問） ----------
export function getRecognition(): any | null {
  if (typeof window === 'undefined') return null;
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = 'ja-JP';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  return rec;
}

export const recognitionSupported = () =>
  typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
