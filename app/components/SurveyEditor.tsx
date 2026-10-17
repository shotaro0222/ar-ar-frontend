'use client';

// アンケートの作成・編集（管理画面と契約者画面で共通）
// 設問タイプ：1つ選ぶ／複数選ぶ／数字で評価／マトリクス。設問ごとに条件分岐を設定できる

import React, { useState } from 'react';
import SurveyRunner from './SurveyRunner';
import { Branch, newOpt, newQuestion, Opt, QType, QTYPE_LABEL, Question, Survey, surveyProblems } from '../lib/survey';

type Props = { survey: Survey; onChange: (s: Survey) => void; onDelete?: () => void; allowLottery?: boolean };

export default function SurveyEditor({ survey: s, onChange, onDelete, allowLottery = true }: Props) {
  const [preview, setPreview] = useState(false);
  const set = (patch: Partial<Survey>) => onChange({ ...s, ...patch });
  const setQ = (i: number, patch: Partial<Question>) => set({ questions: s.questions.map((q, k) => (k === i ? { ...q, ...patch } : q)) });
  const move = (i: number, d: number) => {
    const qs = [...s.questions];
    const j = i + d;
    if (j < 0 || j >= qs.length) return;
    [qs[i], qs[j]] = [qs[j], qs[i]];
    set({ questions: qs });
  };
  const problems = surveyProblems(s);
  const inc = s.incentive;

  return (
    <div className={`ad-card se${s.active ? '' : ' is-off'}`}>
      <div className="ad-card-head">
        <span className="ad-type">📝 {s.title || '無題のアンケート'}</span>
        <label className="ad-toggle"><input type="checkbox" checked={s.active} onChange={e => set({ active: e.target.checked })} /> 公開中</label>
        <button className="ad-sub" onClick={() => setPreview(p => !p)}>{preview ? '編集に戻る' : '👀 プレビュー'}</button>
        {onDelete && <button className="ad-del" onClick={() => confirm('このアンケートを削除しますか？（回答データは残ります）') && onDelete()}>削除</button>}
      </div>

      {preview ? (
        <div className="se-preview"><SurveyRunner survey={s} preview onSubmit={async () => ({ ok: true })} /></div>
      ) : (
        <>
          <div className="ad-row">
            <label className="ad-field"><span>タイトル</span><input value={s.title} onChange={e => set({ title: e.target.value })} placeholder="例：ご来店アンケート" /></label>
            <label className="ad-field"><span>公開開始日</span><input type="date" value={s.startAt || ''} onChange={e => set({ startAt: e.target.value || undefined })} /></label>
            <label className="ad-field"><span>公開終了日</span><input type="date" value={s.endAt || ''} onChange={e => set({ endAt: e.target.value || undefined })} /></label>
          </div>
          <label className="ad-field"><span>はじめの説明</span><textarea rows={2} value={s.intro} onChange={e => set({ intro: e.target.value })} placeholder="例：1分で終わる簡単なアンケートです" /></label>
          <label className="ad-field"><span>回答後のお礼</span><input value={s.thanks} onChange={e => set({ thanks: e.target.value })} /></label>

          <div className="se-incentive">
            <b>🎁 回答特典</b>
            <div className="ad-row">
              {(['none', 'coupon', 'lottery'] as const).filter(t => allowLottery || t !== 'lottery').map(t => (
                <label key={t} className="ad-toggle">
                  <input type="radio" checked={inc.type === t} onChange={() => set({ incentive: { ...inc, type: t } })} />
                  {t === 'none' ? 'なし' : t === 'coupon' ? '全員にクーポン' : '抽選（その場で当たり／はずれ）'}
                </label>
              ))}
            </div>
            {inc.type !== 'none' && (
              <>
                <div className="ad-row">
                  <label className="ad-field"><span>特典の内容</span><input value={inc.text || ''} onChange={e => set({ incentive: { ...inc, text: e.target.value } })} placeholder="例：ドリンク1杯無料" /></label>
                  <label className="ad-field"><span>クーポンコード（任意）</span><input value={inc.code || ''} onChange={e => set({ incentive: { ...inc, code: e.target.value } })} placeholder="例：THANKS10" /></label>
                  <label className="ad-field"><span>特典ページURL（任意）</span><input value={inc.url || ''} onChange={e => set({ incentive: { ...inc, url: e.target.value } })} placeholder="https://" /></label>
                </div>
                {inc.type === 'lottery' && (
                  <div className="ad-row">
                    <label className="ad-field"><span>当選確率（%）</span><input type="number" min={0} max={100} value={inc.winRate ?? 10} onChange={e => set({ incentive: { ...inc, winRate: Number(e.target.value) } })} /></label>
                    <label className="ad-field"><span>当選者の上限（0＝上限なし）</span><input type="number" min={0} value={inc.maxWinners ?? 0} onChange={e => set({ incentive: { ...inc, maxWinners: parseInt(e.target.value, 10) || 0 } })} /></label>
                    <label className="ad-field"><span>はずれの言葉</span><input value={inc.loseText || ''} onChange={e => set({ incentive: { ...inc, loseText: e.target.value } })} placeholder="残念！またチャレンジしてね" /></label>
                  </div>
                )}
                {inc.type === 'lottery' && <small className="ad-small">当選者には引換番号が出ます。「引換番号の確認」で本物か・使用済みかを確認できます。</small>}
              </>
            )}
          </div>

          <div className="se-questions">
            {s.questions.map((q, i) => (
              <QuestionEditor key={q.id} q={q} i={i} all={s.questions}
                onChange={patch => setQ(i, patch)}
                onMove={d => move(i, d)}
                onRemove={() => set({ questions: s.questions.filter((_, k) => k !== i) })} />
            ))}
            <div className="ad-row se-add">
              {(Object.keys(QTYPE_LABEL) as QType[]).map(t => (
                <button key={t} className="ad-sub" onClick={() => set({ questions: [...s.questions, newQuestion(t)] })}>＋ {QTYPE_LABEL[t]}</button>
              ))}
            </div>
          </div>

          {problems.length > 0 && (
            <ul className="se-problems">{problems.map(p => <li key={p}>⚠ {p}</li>)}</ul>
          )}
        </>
      )}
    </div>
  );
}

function OptList({ label, list, onChange }: { label: string; list: Opt[]; onChange: (l: Opt[]) => void }) {
  return (
    <div className="se-opts">
      <span className="se-opts-label">{label}</span>
      {list.map((o, k) => (
        <div key={o.id} className="se-opt">
          <input value={o.label} onChange={e => onChange(list.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)))} placeholder={`${label}${k + 1}`} />
          <button className="ad-del" onClick={() => onChange(list.filter((_, j) => j !== k))} aria-label="削除">✕</button>
        </div>
      ))}
      <button className="ad-sub" onClick={() => onChange([...list, newOpt()])}>＋ 追加</button>
    </div>
  );
}

function QuestionEditor({ q, i, all, onChange, onMove, onRemove }: {
  q: Question; i: number; all: Question[]; onChange: (p: Partial<Question>) => void; onMove: (d: number) => void; onRemove: () => void;
}) {
  const later = all.slice(i + 1);
  const branches = q.branches || [];
  const setB = (k: number, patch: Partial<Branch>) => onChange({ branches: branches.map((b, j) => (j === k ? { ...b, ...patch } : b)) });
  const canBranch = q.type !== 'matrix';

  return (
    <div className="se-q">
      <div className="se-q-head">
        <b>Q{i + 1}</b>
        <select value={q.type} onChange={e => {
          const t = e.target.value as QType;
          const fresh = newQuestion(t);
          onChange({ type: t, options: q.options || fresh.options, rows: q.rows || fresh.rows, cols: q.cols || fresh.cols, min: q.min ?? fresh.min, max: q.max ?? fresh.max, minLabel: q.minLabel ?? fresh.minLabel, maxLabel: q.maxLabel ?? fresh.maxLabel, branches: [] });
        }}>
          {(Object.keys(QTYPE_LABEL) as QType[]).map(t => <option key={t} value={t}>{QTYPE_LABEL[t]}</option>)}
        </select>
        <label className="ad-toggle"><input type="checkbox" checked={q.required} onChange={e => onChange({ required: e.target.checked })} /> 必須</label>
        <span className="se-spacer" />
        <button className="ad-sub" onClick={() => onMove(-1)} aria-label="上へ">↑</button>
        <button className="ad-sub" onClick={() => onMove(1)} aria-label="下へ">↓</button>
        <button className="ad-del" onClick={onRemove}>削除</button>
      </div>
      <input className="se-q-text" value={q.text} onChange={e => onChange({ text: e.target.value })} placeholder="設問文（例：本日のご来店は何回目ですか？）" />

      {(q.type === 'single' || q.type === 'multi') && (
        <>
          <OptList label="選択肢" list={q.options || []} onChange={options => onChange({ options })} />
          {q.type === 'multi' && (
            <label className="ad-field se-inline"><span>選べる数の上限（0＝無制限）</span>
              <input type="number" min={0} value={q.maxSelect || 0} onChange={e => onChange({ maxSelect: parseInt(e.target.value, 10) || undefined })} /></label>
          )}
        </>
      )}
      {q.type === 'scale' && (
        <div className="ad-row">
          <label className="ad-field"><span>最小</span><input type="number" min={0} max={9} value={q.min ?? 1} onChange={e => onChange({ min: parseInt(e.target.value, 10) })} /></label>
          <label className="ad-field"><span>最大</span><input type="number" min={1} max={10} value={q.max ?? 5} onChange={e => onChange({ max: parseInt(e.target.value, 10) })} /></label>
          <label className="ad-field"><span>最小側の言葉</span><input value={q.minLabel || ''} onChange={e => onChange({ minLabel: e.target.value })} /></label>
          <label className="ad-field"><span>最大側の言葉</span><input value={q.maxLabel || ''} onChange={e => onChange({ maxLabel: e.target.value })} /></label>
        </div>
      )}
      {q.type === 'matrix' && (
        <div className="se-matrix">
          <OptList label="行（評価する項目）" list={q.rows || []} onChange={rows => onChange({ rows })} />
          <OptList label="列（評価）" list={q.cols || []} onChange={cols => onChange({ cols })} />
        </div>
      )}

      {canBranch && (
        <div className="se-branches">
          <span className="se-opts-label">🔀 条件分岐（指定がなければ次の設問へ）</span>
          {branches.map((b, k) => (
            <div key={k} className="se-branch">
              <span>回答が</span>
              {q.type === 'scale' ? (
                <select value={b.when} onChange={e => setB(k, { when: e.target.value })}>
                  {[...range(q.min ?? 1, q.max ?? 5).map(n => `>=${n}`), ...range(q.min ?? 1, q.max ?? 5).map(n => `<=${n}`), ...range(q.min ?? 1, q.max ?? 5).map(n => `${n}`)]
                    .map(v => <option key={v} value={v}>{v.startsWith('>=') ? `${v.slice(2)}以上` : v.startsWith('<=') ? `${v.slice(2)}以下` : `${v}ちょうど`}</option>)}
                </select>
              ) : (
                <select value={b.when} onChange={e => setB(k, { when: e.target.value })}>
                  {(q.options || []).map(o => <option key={o.id} value={o.id}>「{o.label || '（空）'}」{q.type === 'multi' ? 'を含む' : ''}</option>)}
                </select>
              )}
              <span>なら</span>
              <select value={b.goto} onChange={e => setB(k, { goto: e.target.value })}>
                {later.map(x => <option key={x.id} value={x.id}>Q{all.indexOf(x) + 1}：{x.text.slice(0, 18) || '（無題）'} へ</option>)}
                <option value="end">終了（送信）</option>
              </select>
              <button className="ad-del" onClick={() => onChange({ branches: branches.filter((_, j) => j !== k) })}>✕</button>
            </div>
          ))}
          <button className="ad-sub" onClick={() => onChange({
            branches: [...branches, { when: q.type === 'scale' ? `<=${q.min ?? 1}` : q.options?.[0]?.id || '', goto: later[0]?.id || 'end' }]
          })}>＋ 分岐を追加</button>
        </div>
      )}
    </div>
  );
}

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
