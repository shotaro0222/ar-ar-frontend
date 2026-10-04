// 読み上げ（音声合成）と音声入力（音声認識）のヘルパー

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

export function stopTalk(holder: TalkHolder) {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  if (holder.timer) clearTimeout(holder.timer);
  holder.timer = null;
  holder.session = null;
  holder.utterances = [];
}

/**
 * 新しい読み上げを始める（前の読み上げは止める）。
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

  const synth = !opts.muted && typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  let outstanding = 0;
  let isReady = false;
  let broken = !synth;
  let totalLen = 0;

  const finish = () => {
    if (!alive()) return;
    if (holder.timer) clearTimeout(holder.timer);
    holder.timer = null;
    holder.session = null;
    holder.utterances = [];
    opts.onDone();
  };
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
