'use client';

// クライアント（サーベイの依頼主）向けの集計レポート：/report?k=レポートキー
// ログイン不要・閲覧専用。印刷すると PDF で保存できる

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import SurveyResults from '../components/SurveyResults';
import { API_BASE } from '../lib/api';
import { Agg, Survey } from '../lib/survey';

type Item = { survey: Survey; agg: Agg; winners?: number };
type Report = { client: { name: string }; generatedAt: string; devices: Record<string, string>; surveys: Item[] };

const jst = (iso: string) => new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 10);
const fmtDate = (d?: string) => (d ? d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日').replace(/年0/, '年').replace(/月0/, '月') : '');

function Inner() {
  const key = useSearchParams().get('k') || '';
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!key) { setError('レポートURLが正しくありません'); return; }
    fetch(`${API_BASE}/api/report?key=${encodeURIComponent(key)}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error || '読み込めませんでした'); setData(d); })
      .catch(e => setError(e.message || '読み込めませんでした'));
  }, [key]);

  if (error) return <main className="rp"><p className="rp-error">{error}</p></main>;
  if (!data) return <main className="rp"><p className="rp-loading">読み込み中…</p></main>;

  const total = data.surveys.reduce((n, x) => n + (x.agg.total || 0), 0);
  const running = data.surveys.filter(x => status(x.survey) === 'running').length;

  return (
    <main className="rp">
      <header className="rp-head">
        <div>
          <p className="rp-kicker">アンケート集計レポート</p>
          <h1>{data.client.name} 様</h1>
          <p className="rp-meta">作成日時：{new Date(data.generatedAt).toLocaleString('ja-JP')}</p>
        </div>
        <button className="rp-print rp-noprint" onClick={() => window.print()}>🖨 印刷・PDFで保存</button>
      </header>

      <section className="rp-tiles">
        <Tile label="アンケート数" value={data.surveys.length} unit="件" />
        <Tile label="実施中" value={running} unit="件" />
        <Tile label="総回答数" value={total} unit="件" />
      </section>

      {data.surveys.length === 0 && <p className="rp-empty">まだ割り当てられたアンケートはありません。</p>}
      {data.surveys.map(x => <SurveySection key={x.survey.id} item={x} devices={data.devices} reportKey={key} />)}

      <footer className="rp-foot">
        回答は匿名で集計しています。数値はこのページを開いた時点のものです。<br />
        News Summoner
      </footer>
    </main>
  );
}

function status(s: Survey): 'running' | 'scheduled' | 'ended' | 'stopped' {
  const today = jst(new Date().toISOString());
  if (s.endAt && s.endAt < today) return 'ended';
  if (s.startAt && today < s.startAt) return 'scheduled';
  return s.active ? 'running' : 'stopped';
}
const STATUS_LABEL = { running: '実施中', scheduled: '開始前', ended: '終了', stopped: '停止中' };

function SurveySection({ item, devices, reportKey }: { item: Item; devices: Record<string, string>; reportKey: string }) {
  const { survey, agg, winners } = item;
  const st = status(survey);
  const days = Object.keys(agg.days || {}).sort();
  const firstDay = agg.first ? jst(agg.first) : days[0];
  const period = survey.startAt || survey.endAt
    ? `${fmtDate(survey.startAt) || '開始日未設定'} 〜 ${fmtDate(survey.endAt) || '終了日未設定'}`
    : firstDay ? `${fmtDate(firstDay)} 〜` : '期間の設定なし';
  const peak = days.reduce((best, d) => ((agg.days![d] || 0) > (agg.days![best] || 0) ? d : best), days[0]);
  const places = Object.entries(agg.dev || {}).sort((a, b) => b[1] - a[1]);
  const placeTotal = places.reduce((n, [, v]) => n + v, 0);
  const exportRows = async () => {
    const r = await fetch(`${API_BASE}/api/report/export?key=${encodeURIComponent(reportKey)}&id=${encodeURIComponent(survey.id)}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error);
    return d.rows;
  };

  return (
    <section className="rp-survey">
      <div className="rp-survey-head">
        <h2>{survey.title}</h2>
        <span className={`rp-status is-${st}`}>{STATUS_LABEL[st]}</span>
      </div>
      <p className="rp-meta">実施期間：{period}　｜　設問数：{survey.questions.length}問{survey.incentive?.type !== 'none' && survey.incentive?.text ? `　｜　回答特典：${survey.incentive.text}` : ''}</p>

      <div className="rp-tiles is-small">
        <Tile label="回答数" value={agg.total || 0} unit="件" />
        <Tile label="回答があった日" value={days.length} unit="日" />
        <Tile label="1日あたり（平均）" value={days.length ? Math.round(((agg.total || 0) / days.length) * 10) / 10 : 0} unit="件" />
        {survey.incentive?.type === 'lottery' && <Tile label="抽選の当選" value={winners || 0} unit="件" />}
      </div>

      {days.length > 0 && (
        <div className="rp-block">
          <h3>日別の回答数{peak ? <small>（最多：{fmtDate(peak)} {agg.days![peak]}件）</small> : null}</h3>
          <DailyChart days={agg.days!} />
        </div>
      )}

      {places.length > 0 && (
        <div className="rp-block">
          <h3>回答場所別</h3>
          {places.map(([id, n]) => {
            const pct = placeTotal ? Math.round((n / placeTotal) * 100) : 0;
            return (
              <div key={id} className="sr-bar">
                <span className="sr-bar-label">{devices[id] || '設置場所'}</span>
                <span className="sr-bar-track"><i style={{ width: `${pct}%` }} /></span>
                <span className="sr-bar-n">{n}（{pct}%）</span>
              </div>
            );
          })}
        </div>
      )}

      {(agg.total || 0) > 0 && (agg.total || 0) !== placeTotal && (
        <p className="rp-note rp-noprint">※ 日別・場所別の内訳は、内訳の記録を始める前の回答を含んでいません（合計：{agg.total}件）。</p>
      )}

      <div className="rp-block">
        <h3>設問ごとの結果</h3>
        <SurveyResults survey={survey} agg={agg} onExport={exportRows} deviceNames={devices} />
      </div>
    </section>
  );
}

// 日別の回答数（最初の回答日〜最後の回答日。長い場合は直近90日）
function DailyChart({ days }: { days: Record<string, number> }) {
  const series = useMemo(() => {
    const keys = Object.keys(days).sort();
    if (!keys.length) return [];
    const out: { d: string; n: number }[] = [];
    const last = Date.parse(keys[keys.length - 1]);
    // 回答日が少なくても2週間分の枠で表示する
    for (let t = Math.min(Date.parse(keys[0]), last - 13 * 86400_000); t <= last; t += 86400_000) {
      const d = new Date(t).toISOString().slice(0, 10);
      out.push({ d, n: days[d] || 0 });
    }
    return out.slice(-90);
  }, [days]);
  const [hover, setHover] = useState<number | null>(null);
  if (!series.length) return null;
  const max = Math.max(1, ...series.map(x => x.n));
  const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;

  return (
    <div className="rp-chart">
      <div className="rp-chart-y" aria-hidden="true"><span>{max}</span><span>0</span></div>
      <div className="rp-chart-plot" role="img" aria-label="日別の回答数">
        {series.map((x, i) => (
          <div key={x.d} className="rp-col" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
            {x.n > 0 && <i className={hover === i ? 'is-on' : ''} style={{ height: `${(x.n / max) * 100}%` }} />}
            {hover === i && <span className="rp-tip">{fmtDate(x.d)}：<b>{x.n}件</b></span>}
          </div>
        ))}
      </div>
      <div className="rp-chart-x" aria-hidden="true"><span>{md(series[0].d)}</span><span>{md(series[series.length - 1].d)}</span></div>
      <table className="rp-sr-only">
        <caption>日別の回答数</caption>
        <tbody>{series.filter(x => x.n).map(x => <tr key={x.d}><th>{x.d}</th><td>{x.n}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function Tile({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rp-tile">
      <small>{label}</small>
      <b>{value.toLocaleString()}<span>{unit}</span></b>
    </div>
  );
}

export default function ReportPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
