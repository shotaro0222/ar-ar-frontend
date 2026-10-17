'use client';

// アンケートの回答画面（タッチ操作向け。サイネージでもスマホでも使う）
// 1画面1問・大きなボタン・分岐対応・送信後に特典（クーポン／抽選）を表示

import React, { useEffect, useMemo, useState } from 'react';
import { isAnswered, nextQuestionId, Question, SubmitResult, Survey } from '../lib/survey';

type Props = {
  survey: Pick<Survey, 'id' | 'title' | 'intro' | 'thanks' | 'questions'> & { incentive: { type: string; text?: string } };
  onSubmit: (answers: Record<string, any>) => Promise<SubmitResult>;
  big?: boolean; // サイネージ用の大きな表示
  resetAfter?: number; // 完了画面から自動で最初に戻る秒数（サイネージ）
  onFinish?: () => void;
  preview?: boolean; // 管理画面のプレビュー（送信しない）
};

export default function SurveyRunner({ survey, onSubmit, big, resetAfter, onFinish, preview }: Props) {
  const [started, setStarted] = useState(false);
  const [path, setPath] = useState<string[]>([]); // たどった設問ID（戻る用）
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState('');

  const qid = path[path.length - 1];
  const q = useMemo(() => survey.questions.find(x => x.id === qid), [survey, qid]);
  const value = q ? answers[q.id] : undefined;
  const index = q ? survey.questions.findIndex(x => x.id === q.id) : -1;

  const reset = () => { setStarted(false); setPath([]); setAnswers({}); setResult(null); setError(''); };

  useEffect(() => { reset(); /* 設問が差し替わったら最初から */ }, [survey.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!result || !resetAfter) return;
    const t = setTimeout(() => { reset(); onFinish?.(); }, resetAfter * 1000);
    return () => clearTimeout(t);
  }, [result, resetAfter]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => { setStarted(true); setPath([survey.questions[0]?.id].filter(Boolean)); };

  const setValue = (v: any) => q && setAnswers(a => ({ ...a, [q.id]: v }));

  const submit = async (final: Record<string, any>) => {
    if (preview) { setResult({ ok: true, thanks: survey.thanks, incentive: { type: survey.incentive.type as any, won: true, text: survey.incentive.text, code: 'PREVIEW', claim: survey.incentive.type === 'lottery' ? 'ABC123' : undefined } }); return; }
    setBusy(true);
    setError('');
    try {
      const r = await onSubmit(final);
      if (r.error) setError(r.error); else setResult(r);
    } catch {
      setError('送信できませんでした。もう一度お試しください');
    } finally {
      setBusy(false);
    }
  };

  const next = (v = value) => {
    if (!q) return;
    const done = { ...answers, [q.id]: v };
    // 分岐後に通らなくなった設問の回答は送らない
    const nid = nextQuestionId(survey as Survey, q, v);
    if (nid === 'end') {
      const keep = new Set([...path]);
      submit(Object.fromEntries(Object.entries(done).filter(([k]) => keep.has(k))));
    } else {
      setPath(p => [...p, nid]);
    }
  };

  // 1つ選ぶ・数字評価はタップで次へ進む
  const pick = (v: any) => { setValue(v); setTimeout(() => next(v), 180); };

  const cls = `sv${big ? ' sv-big' : ''}`;

  if (result) {
    const inc = result.incentive;
    return (
      <div className={cls}>
        <div className="sv-done">
          <div className="sv-done-icon">{inc?.type === 'lottery' ? (inc.won ? '🎉' : '🍀') : '🙌'}</div>
          <h2>{inc?.type === 'lottery' ? (inc.won ? 'あたり！' : 'ざんねん…') : result.thanks}</h2>
          {inc && inc.type !== 'none' && (
            <div className={`sv-prize${inc.won ? ' is-won' : ''}`}>
              {inc.text && <p>{inc.text}</p>}
              {inc.won && inc.code && <div className="sv-code"><small>クーポンコード</small><b>{inc.code}</b></div>}
              {inc.won && inc.claim && <div className="sv-code"><small>引換番号（スタッフに見せてください）</small><b>{inc.claim}</b></div>}
              {inc.won && inc.url && <a className="sv-btn" href={inc.url} target="_blank" rel="noreferrer">特典ページを開く</a>}
              {inc.won && <p className="sv-note">この画面をスマホで撮影するか、スタッフにお見せください</p>}
            </div>
          )}
          {inc?.type === 'lottery' && <p className="sv-thanks">{result.thanks}</p>}
          {!resetAfter && <button className="sv-btn sv-sub" onClick={reset}>最初の画面に戻る</button>}
          {resetAfter ? <p className="sv-note">{resetAfter}秒後に最初の画面に戻ります</p> : null}
        </div>
      </div>
    );
  }

  if (!started || !q) {
    return (
      <div className={cls}>
        <div className="sv-intro">
          <div className="sv-kicker">📝 アンケート</div>
          <h2>{survey.title}</h2>
          {survey.intro && <p>{survey.intro}</p>}
          {survey.incentive.type !== 'none' && survey.incentive.text && (
            <div className="sv-incentive">🎁 {survey.incentive.type === 'lottery' ? '回答すると抽選で' : '回答すると'}「{survey.incentive.text}」</div>
          )}
          <button className="sv-btn sv-start" onClick={start} disabled={!survey.questions.length}>はじめる（約{Math.max(1, Math.round(survey.questions.length * 0.3))}分）</button>
        </div>
      </div>
    );
  }

  const canNext = !q.required || isAnswered(q, value);

  return (
    <div className={cls}>
      <div className="sv-progress"><i style={{ width: `${Math.round(((index + 1) / survey.questions.length) * 100)}%` }} /></div>
      <div className="sv-q">
        <div className="sv-qno">Q{index + 1}{!q.required && <small>（任意）</small>}</div>
        <h2>{q.text}</h2>
        {q.type === 'multi' && <p className="sv-hint">あてはまるものをすべて{q.maxSelect ? `（${q.maxSelect}つまで）` : ''}</p>}
        <QuestionInput q={q} value={value} onPick={pick} onChange={setValue} />
      </div>
      {error && <p className="sv-error">{error}</p>}
      <div className="sv-nav">
        <button className="sv-btn sv-sub" onClick={() => (path.length > 1 ? setPath(p => p.slice(0, -1)) : reset())} disabled={busy}>← 戻る</button>
        {(q.type === 'multi' || q.type === 'matrix' || !q.required) && (
          <button className="sv-btn" onClick={() => next()} disabled={!canNext || busy}>{busy ? '送信中…' : '次へ →'}</button>
        )}
      </div>
    </div>
  );
}

function QuestionInput({ q, value, onPick, onChange }: { q: Question; value: any; onPick: (v: any) => void; onChange: (v: any) => void }) {
  if (q.type === 'single') {
    return (
      <div className="sv-opts">
        {(q.options || []).map(o => (
          <button key={o.id} className={`sv-opt${value === o.id ? ' is-on' : ''}`} onClick={() => onPick(o.id)}>{o.label}</button>
        ))}
      </div>
    );
  }
  if (q.type === 'multi') {
    const list: string[] = Array.isArray(value) ? value : [];
    return (
      <div className="sv-opts">
        {(q.options || []).map(o => {
          const on = list.includes(o.id);
          const full = !!q.maxSelect && list.length >= q.maxSelect && !on;
          return (
            <button key={o.id} className={`sv-opt${on ? ' is-on' : ''}`} disabled={full}
              onClick={() => onChange(on ? list.filter(x => x !== o.id) : [...list, o.id])}>
              <span className="sv-check">{on ? '☑' : '☐'}</span>{o.label}
            </button>
          );
        })}
      </div>
    );
  }
  if (q.type === 'scale') {
    const nums: number[] = [];
    for (let i = q.min ?? 1; i <= (q.max ?? 5); i++) nums.push(i);
    return (
      <div className="sv-scale">
        <div className="sv-scale-row">
          {nums.map(n => <button key={n} className={`sv-num${value === n ? ' is-on' : ''}`} onClick={() => onPick(n)}>{n}</button>)}
        </div>
        <div className="sv-scale-labels"><span>{q.minLabel}</span><span>{q.maxLabel}</span></div>
      </div>
    );
  }
  // matrix
  const m: Record<string, string> = value || {};
  return (
    <div className="sv-matrix" role="table">
      <div className="sv-mrow sv-mhead" role="row">
        <span />
        {(q.cols || []).map(c => <span key={c.id} role="columnheader">{c.label}</span>)}
      </div>
      {(q.rows || []).map(r => (
        <div key={r.id} className="sv-mrow" role="row">
          <span className="sv-mlabel" role="rowheader">{r.label}</span>
          {(q.cols || []).map(c => (
            <button key={c.id} className={`sv-mcell${m[r.id] === c.id ? ' is-on' : ''}`} aria-label={`${r.label}：${c.label}`}
              onClick={() => onChange({ ...m, [r.id]: c.id })}>{m[r.id] === c.id ? '●' : '○'}</button>
          ))}
        </div>
      ))}
    </div>
  );
}
