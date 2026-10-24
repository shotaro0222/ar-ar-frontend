// サーベイ（アンケート）の型と分岐ロジック。サーバー（engage.ts）と同じ判定をする

export type Opt = { id: string; label: string };
export type Branch = { when: string; goto: string };
export type QType = 'single' | 'multi' | 'scale' | 'matrix';
export type Question = {
  id: string;
  type: QType;
  text: string;
  required: boolean;
  options?: Opt[];
  maxSelect?: number;
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  rows?: Opt[];
  cols?: Opt[];
  branches?: Branch[];
};
export type Incentive = {
  type: 'none' | 'coupon' | 'lottery';
  text?: string;
  code?: string;
  url?: string;
  winRate?: number;
  maxWinners?: number;
  loseText?: string;
};
export type Survey = {
  id: string;
  title: string;
  active: boolean;
  intro: string;
  thanks: string;
  questions: Question[];
  incentive: Incentive;
  owner?: string;
  client?: string; // 依頼主（クライアント）ID
  startAt?: string;
  endAt?: string;
};
export type SubmitResult = {
  ok?: boolean;
  error?: string;
  thanks?: string;
  incentive?: { type: 'none' | 'coupon' | 'lottery'; won?: boolean; text?: string; code?: string; url?: string; claim?: string };
};
// days：日別の回答数、dev：設置場所（端末ID・qr・web）別の回答数
export type Agg = { total: number; q: Record<string, Record<string, any>>; days?: Record<string, number>; dev?: Record<string, number>; first?: string; updated?: string };
export type Client = { id: string; name: string; contact?: string; note?: string; reportKey?: string };

export const QTYPE_LABEL: Record<QType, string> = {
  single: '1つ選ぶ',
  multi: '複数選ぶ',
  scale: '数字で評価',
  matrix: 'マトリクス（表形式）'
};

const uid = () => Math.random().toString(36).slice(2, 8);
export const newOpt = (label = ''): Opt => ({ id: uid(), label });

export function newQuestion(type: QType = 'single'): Question {
  const q: Question = { id: uid(), type, text: '', required: true, branches: [] };
  if (type === 'single' || type === 'multi') q.options = [newOpt('はい'), newOpt('いいえ')];
  if (type === 'scale') { q.min = 1; q.max = 5; q.minLabel = '不満'; q.maxLabel = '満足'; }
  if (type === 'matrix') { q.rows = [newOpt('味'), newOpt('接客')]; q.cols = [newOpt('良い'), newOpt('普通'), newOpt('悪い')]; }
  return q;
}

export function newSurvey(): Survey {
  return {
    id: uid() + uid(),
    title: '',
    active: false,
    intro: '',
    thanks: 'ご回答ありがとうございました！',
    questions: [newQuestion('single')],
    incentive: { type: 'none' }
  };
}

function matchBranch(q: Question, value: any, when: string): boolean {
  if (q.type === 'single') return value === when;
  if (q.type === 'multi') return Array.isArray(value) && value.includes(when);
  if (q.type === 'scale') {
    const m = when.match(/^(>=|<=|=|>|<)?\s*(\d+)$/);
    if (!m || typeof value !== 'number') return false;
    const n = parseInt(m[2], 10);
    return m[1] === '>=' ? value >= n : m[1] === '<=' ? value <= n : m[1] === '>' ? value > n : m[1] === '<' ? value < n : value === n;
  }
  return false;
}

export function nextQuestionId(s: Survey, current: Question, value: any): string {
  for (const b of current.branches || []) if (matchBranch(current, value, b.when)) return b.goto;
  const i = s.questions.findIndex(q => q.id === current.id);
  return s.questions[i + 1]?.id || 'end';
}

export function isAnswered(q: Question, v: any): boolean {
  if (v === undefined || v === null) return false;
  if (q.type === 'multi') return Array.isArray(v) && v.length > 0;
  if (q.type === 'matrix') return !!v && (q.rows || []).every(r => v[r.id]);
  return true;
}

// 分岐先が存在するか、ループしていないかを確認（管理画面の警告用）
export function surveyProblems(s: Survey): string[] {
  const out: string[] = [];
  if (!s.title) out.push('タイトルが空です');
  if (!s.questions.length) out.push('設問がありません');
  const ids = new Set(s.questions.map(q => q.id));
  s.questions.forEach((q, i) => {
    const n = `Q${i + 1}`;
    if (!q.text) out.push(`${n}：設問文が空です`);
    if ((q.type === 'single' || q.type === 'multi') && (q.options || []).filter(o => o.label).length < 2) out.push(`${n}：選択肢を2つ以上入れてください`);
    if (q.type === 'matrix' && (!(q.rows || []).length || (q.cols || []).length < 2)) out.push(`${n}：行を1つ以上、列を2つ以上入れてください`);
    for (const b of q.branches || []) {
      if (b.goto !== 'end' && !ids.has(b.goto)) out.push(`${n}：分岐先の設問がありません`);
      const target = s.questions.findIndex(x => x.id === b.goto);
      if (target !== -1 && target <= i) out.push(`${n}：分岐先が前の設問です（戻るとループします）`);
    }
  });
  if (s.incentive.type === 'lottery' && !(s.incentive.winRate! > 0)) out.push('抽選の当選確率が0%です');
  return out;
}
