'use client';

// ニュースクイズ：/play（?scope=サイネージ端末ID で、そのサイネージのランキングに参加）

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import QuizGame from '../components/QuizGame';

function Inner() {
  const params = useSearchParams();
  const scope = (params.get('scope') || 'web').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'web';
  return (
    <div className="pg-root">
      <header className="pg-head">
        <a href="/">🔮 News Summoner</a>
        <a className="pg-link" href="/">ニュースを聞く →</a>
      </header>
      <main className="pg-main">
        <h1 className="pg-h1">ニュースクイズ</h1>
        <QuizGame scope={scope} mode="play" />
      </main>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
