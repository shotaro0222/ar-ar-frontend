'use client';

// アンケートの集計表示とCSV出力（管理画面・契約者画面で共通）

import React from 'react';
import { Agg, Survey } from '../lib/survey';

type Props = { survey: Survey; agg: Agg | null; onExport?: () => Promise<{ device?: string; created: string; answers: Record<string, any> }[]> };

export default function SurveyResults({ survey, agg, onExport }: Props) {
  const total = agg?.total || 0;

  const csv = async () => {
    if (!onExport) return;
    const rows = await onExport();
    const head = ['回答日時', '端末', ...survey.questions.flatMap(q =>
      q.type === 'matrix' ? (q.rows || []).map(r => `${q.text}：${r.label}`) : [q.text])];
    const label = (list: { id: string; label: string }[] | undefined, id: string) => list?.find(o => o.id === id)?.label || id;
    const lines = rows.map(r => [
      new Date(r.created).toLocaleString('ja-JP'),
      r.device || '',
      ...survey.questions.flatMap(q => {
        const v = r.answers[q.id];
        if (q.type === 'matrix') return (q.rows || []).map(row => (v?.[row.id] ? label(q.cols, v[row.id]) : ''));
        if (v === undefined) return [''];
        if (q.type === 'multi') return [(v as string[]).map(id => label(q.options, id)).join(' / ')];
        if (q.type === 'single') return [label(q.options, v)];
        return [String(v)];
      })
    ]);
    const esc = (c: string) => `"${String(c).replace(/"/g, '""')}"`;
    const text = [head, ...lines].map(l => l.map(esc).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
    a.download = `survey-${survey.id}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="sr">
      <div className="sr-head">
        <b>📊 {survey.title || '無題'}：回答 {total.toLocaleString()} 件</b>
        {onExport && <button onClick={csv} disabled={!total}>CSVで保存</button>}
      </div>
      {survey.questions.map((q, i) => {
        const a = agg?.q?.[q.id] || {};
        return (
          <div key={q.id} className="sr-q">
            <div className="sr-qtext">Q{i + 1}. {q.text}</div>
            {(q.type === 'single' || q.type === 'multi') && (q.options || []).map(o => <Bar key={o.id} label={o.label} n={a[o.id] || 0} total={total} />)}
            {q.type === 'scale' && (
              <>
                <div className="sr-avg">平均 {a._n ? (a._sum / a._n).toFixed(2) : '-'}（{q.min}〜{q.max}）</div>
                {range(q.min ?? 1, q.max ?? 5).map(n => <Bar key={n} label={String(n)} n={a[String(n)] || 0} total={a._n || 0} />)}
              </>
            )}
            {q.type === 'matrix' && (
              <table className="ad-table sr-matrix">
                <thead><tr><th />{(q.cols || []).map(c => <th key={c.id}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {(q.rows || []).map(r => {
                    const row = a[r.id] || {};
                    const sum = Object.values(row).reduce((x: number, y: any) => x + (y as number), 0) as number;
                    return (
                      <tr key={r.id}><td>{r.label}</td>{(q.cols || []).map(c => <td key={c.id}>{row[c.id] || 0}{sum ? `（${Math.round(((row[c.id] || 0) / sum) * 100)}%）` : ''}</td>)}</tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Bar({ label, n, total }: { label: string; n: number; total: number }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div className="sr-bar">
      <span className="sr-bar-label">{label}</span>
      <span className="sr-bar-track"><i style={{ width: `${pct}%` }} /></span>
      <span className="sr-bar-n">{n}（{pct}%）</span>
    </div>
  );
}

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
