'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';

export default function WidgetPage() {
  const searchParams = useSearchParams();
  const keyword = searchParams.get('keyword') || 'ニュース';
  
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [isSummoning, setIsSummoning] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleSummon = async () => {
    setIsSummoning(true);
    setProgress(0);
    setAssetUrl(null);

    try {
      const res = await fetch('https://xr-reference.kyouhitotsu-dev.workers.dev/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, mode: '3d' })
      });
      const data = await res.json();

      if (data.taskId) {
        pollStatus(data.taskId);
      } else {
        setIsSummoning(false);
      }
    } catch (error) {
      console.error(error);
      setIsSummoning(false);
    }
  };

  const pollStatus = (taskId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`https://xr-reference.kyouhitotsu-dev.workers.dev/api/status?taskId=${taskId}`);
        const data = await res.json();
        if (data.status === 'SUCCEEDED') {
          clearInterval(interval);
          setAssetUrl(data.model_urls.glb);
          setIsSummoning(false);
        } else if (data.status === 'FAILED') {
          clearInterval(interval);
          setIsSummoning(false);
        } else {
          setProgress(data.progress || 0);
        }
      } catch {
        clearInterval(interval);
        setIsSummoning(false);
      }
    }, 5000);
  };

  return (
    <div style={{
      width: '100%', minHeight: '100vh', backgroundColor: 'transparent',
      fontFamily: 'system-ui, sans-serif', padding: '12px', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    }}>
      <style dangerouslySetInnerHTML={{__html: `
        body { background: transparent !important; margin: 0; }
        model-viewer:focus { outline: none; }
      `}} />
      <Script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js" />

      <div style={{
        width: '100%', maxWidth: '400px', backgroundColor: '#111827', borderRadius: '12px',
        border: '1px solid rgba(59, 130, 246, 0.3)', padding: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
      }}>
        {!assetUrl ? (
          <>
            <p style={{ color: '#9ca3af', fontSize: '12px', textAlign: 'center', margin: '0 0 12px 0' }}>
              この記事の3DモデルをXR召喚
            </p>
            <button
              onClick={handleSummon} disabled={isSummoning}
              style={{
                width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
                background: isSummoning ? '#374151' : 'linear-gradient(135deg, #a855f7, #3b82f6)',
                color: '#fff', fontWeight: 'bold', cursor: isSummoning ? 'not-allowed' : 'pointer'
              }}
            >
              {isSummoning ? `⏳ 生成中... ${progress}%` : '🔮 XRアセットを生成する'}
            </button>
          </>
        ) : (
          <div style={{ width: '100%', height: '300px', position: 'relative' }}>
            {/* @ts-ignore */}
            <model-viewer src={assetUrl} ar ar-modes="webxr scene-viewer quick-look" auto-rotate camera-controls style={{ width: '100%', height: '100%' }} />
          </div>
        )}
      </div>
    </div>
  );
}
