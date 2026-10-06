'use client';

import React, { useState, useEffect } from 'react';
import Script from 'next/script';

const categoryMeta: Record<string, { label: string; icon: string }> = {
  it: { label: 'IT', icon: '⚡' },
  business: { label: 'ビジネス', icon: '📈' },
  entertainment: { label: 'エンタメ', icon: '🎬' },
  funny: { label: 'オモシロ', icon: '🎭' }
};

export default function HomePage() {
  const [newsData, setNewsData] = useState<any>(null);
  const [activeCategory, setActiveCategory] = useState<string>('it');
  const [selectedNews, setSelectedNews] = useState<any>(null);
  
  const [assetType, setAssetType] = useState<'2.5d' | '3d'>('3d');
  const [isSummoning, setIsSummoning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    setCurrentUrl(window.location.href);
    const checkDevice = () => setIsDesktop(window.innerWidth > 768);
    checkDevice();
    window.addEventListener('resize', checkDevice);

    const fetchNews = async () => {
      try {
        const res = await fetch('https://xr-reference.kyouhitotsu-dev.workers.dev/api/news');
        const data = await res.json();
        setNewsData(data);
        const firstCategory = Object.keys(data).find(k => k !== 'last_updated');
        if (firstCategory && data[firstCategory]?.[0]) {
          setActiveCategory(firstCategory);
          setSelectedNews(data[firstCategory][0]);
        }
      } catch (error) {
        console.error("ニュースの取得に失敗しました", error);
      }
    };
    fetchNews();

    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  const handleSummon = async () => {
    if (!selectedNews) return;
    setIsSummoning(true);
    setProgress(0);
    setAssetUrl(null);

    try {
      const res = await fetch('https://xr-reference.kyouhitotsu-dev.workers.dev/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: selectedNews.title, mode: assetType })
      });
      const data = await res.json();

      if (assetType === '2.5d' && data.url) {
        setAssetUrl(data.url);
        setIsSummoning(false);
      } else if (assetType === '3d' && data.taskId) {
        pollMeshyStatus(data.taskId);
      } else {
        setIsSummoning(false);
        alert("生成に失敗しました。");
      }
    } catch (error) {
      console.error("生成エラー:", error);
      setIsSummoning(false);
      alert("通信エラーが発生しました。");
    }
  };

  const pollMeshyStatus = (taskId: string) => {
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
          alert("3Dモデルの生成に失敗しました。");
        } else {
          setProgress(data.progress || 0);
        }
      } catch (err) {
        clearInterval(interval);
        setIsSummoning(false);
      }
    }, 5000);
  };

  const categories = newsData ? Object.keys(newsData).filter(k => k !== 'last_updated') : [];

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#0b0f19', color: '#f3f4f6',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '24px 16px 220px 16px', maxWidth: '720px', margin: '0 auto',
      boxSizing: 'border-box', position: 'relative'
    }}>
      
      <style dangerouslySetInnerHTML={{__html: `
        html, body { margin: 0; padding: 0; background-color: #0b0f19; overflow-x: hidden; }
        model-viewer:focus { outline: none; }
        model-viewer { --poster-color: transparent; width: 100%; height: 350px; background-color: transparent; }
        @keyframes spin-slow { 100% { transform: rotate(360deg); } }
        @keyframes pulse-glow { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
        @keyframes magic-spin { 0% { transform: translateX(-50%) rotate(0deg); } 100% { transform: translateX(-50%) rotate(360deg); } }
      `}} />

      <Script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js" />

      {/* プレミアム機能 ON/OFF スイッチ */}
      <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 10 }}>
        <button 
          onClick={() => setIsPremium(!isPremium)}
          style={{
            backgroundColor: isPremium ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255, 255, 255, 0.1)',
            border: isPremium ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.2)',
            color: isPremium ? '#fbbf24' : '#9ca3af',
            padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer'
          }}>
          {isPremium ? '👑 プレミアム機能ON' : '機能アンロック'}
        </button>
      </div>

      {isDesktop && currentUrl && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', width: '220px',
          backgroundColor: 'rgba(17, 24, 39, 0.9)', backdropFilter: 'blur(8px)',
          padding: '16px', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.3)',
          textAlign: 'center', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)', zIndex: 50
        }}>
          <div style={{ fontSize: '13px', color: '#93c5fd', fontWeight: 800, marginBottom: '8px' }}>📱 スマホでXR体験！</div>
          <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '12px', lineHeight: 1.4 }}>
            スマホのカメラでQRコードを読み込むと、現実空間にニュースを召喚できます。
          </p>
          <div style={{ padding: '8px', backgroundColor: '#fff', borderRadius: '12px', display: 'inline-block' }}>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentUrl)}`} alt="QR Code" style={{ width: '150px', height: '150px', display: 'block' }} />
          </div>
        </div>
      )}

      <header style={{ marginBottom: '28px', textAlign: 'center', paddingTop: '20px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px',
          borderRadius: '9999px', backgroundColor: 'rgba(59, 130, 246, 0.12)',
          border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', fontSize: '11px',
          fontWeight: 700, marginBottom: '16px', letterSpacing: '0.08em'
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3b82f6', boxShadow: '0 0 8px #3b82f6' }}></span>
          News Summoner
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <svg viewBox="0 0 340 80" style={{ width: '100%', maxWidth: '340px', height: 'auto' }}>
            <defs>
              <linearGradient id="textGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ffffff"/>
                <stop offset="50%" stopColor="#93c5fd"/>
                <stop offset="100%" stopColor="#c084fc"/>
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <g style={{ transformOrigin: '40px 40px', animation: 'spin-slow 12s linear infinite' }}>
              <circle cx="40" cy="40" r="28" fill="none" stroke="url(#textGrad)" strokeWidth="1.5" strokeDasharray="4 6" />
              <polygon points="40,15 57,55 18,30 62,30 23,55" fill="none" stroke="#60a5fa" strokeWidth="1" opacity="0.5" />
            </g>
            <circle cx="40" cy="40" r="12" fill="url(#textGrad)" filter="url(#glow)" style={{ animation: 'pulse-glow 2s ease-in-out infinite' }} />
            <text x="85" y="52" fontFamily="system-ui, sans-serif" fontSize="28" fontWeight="900" fill="url(#textGrad)" letterSpacing="1">
              News Summoner
            </text>
          </svg>
        </div>
      </header>

      {/* 生成結果・アバター表示エリア（常にここに3D/2.5Dが表示されます） */}
      {assetUrl && (
        <div style={{
          marginBottom: '24px', padding: '16px', backgroundColor: '#111827',
          borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.3)', textAlign: 'center', position: 'relative', overflow: 'hidden'
        }}>
          <h3 style={{ fontSize: '13px', color: '#93c5fd', margin: '0 0 12px 0', position: 'relative', zIndex: 2 }}>生成完了 - 空間召喚準備OK</h3>
          
          {assetType === '2.5d' ? (
            <img src={assetUrl} alt="2.5D Asset" style={{ maxWidth: '100%', maxHeight: '350px', borderRadius: '8px', position: 'relative', zIndex: 2, display: 'block', margin: '0 auto' }} />
          ) : (
            <div style={{ position: 'relative', width: '100%', height: '350px' }}>
              {isPremium && (
                <div style={{
                  position: 'absolute', bottom: '10px', left: '50%', width: '220px', height: '220px',
                  borderRadius: '50%', border: '2px dashed rgba(251, 191, 36, 0.8)',
                  boxShadow: '0 0 30px rgba(251, 191, 36, 0.5), inset 0 0 30px rgba(251, 191, 36, 0.5)',
                  animation: 'magic-spin 15s linear infinite', zIndex: 1, pointerEvents: 'none', transform: 'translateX(-50%)'
                }}>
                  <div style={{ position: 'absolute', top: '10px', left: '10px', right: '10px', bottom: '10px', border: '1px solid rgba(251, 191, 36, 0.5)', borderRadius: '50%' }} />
                </div>
              )}
              {/* @ts-ignore */}
              <model-viewer 
                src={assetUrl} 
                ar 
                ar-modes="webxr scene-viewer quick-look" 
                auto-rotate 
                camera-controls 
                style={{ width: '100%', height: '100%', outline: 'none', backgroundColor: 'transparent', position: 'relative', zIndex: 2 }} 
              />
            </div>
          )}

          {isDesktop && assetType === '3d' && (
            <p style={{ fontSize: '11px', color: '#fbbf24', marginTop: '12px', lineHeight: 1.4, position: 'relative', zIndex: 2 }}>
              ⚠️ PCでは3Dプレビューのみ可能です。<br/>空間への配置（XR体験）は右上のQRコードからスマホでアクセスしてください。
            </p>
          )}
        </div>
      )}

      {!newsData ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px' }}>最新のニュースを読み込んでいます...</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', padding: '4px', backgroundColor: '#111827', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', overflowX: 'auto' }}>
            {categories.map((key) => {
              const isActive = activeCategory === key;
              const meta = categoryMeta[key] || { label: key, icon: '📰' };
              return (
                <button key={key} onClick={() => { setActiveCategory(key); setSelectedNews(newsData[key][0]); }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                    background: isActive ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'transparent',
                    color: isActive ? '#ffffff' : '#9ca3af', fontWeight: isActive ? 700 : 500,
                    fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap'
                  }}>
                  <span>{meta.icon}</span><span style={{ textTransform: 'uppercase' }}>{meta.label}</span>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px' }}>
            {newsData[activeCategory]?.map((item: any, idx: number) => {
              const isSelected = selectedNews?.url === item.url && selectedNews?.title === item.title;
              const meta = categoryMeta[activeCategory] || { label: activeCategory };
              
              return (
                <div key={idx} style={{ padding: '14px 16px', borderRadius: '12px', backgroundColor: isSelected ? 'rgba(30, 41, 59, 0.9)' : '#111827', border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.05)', transition: 'all 0.2s ease', boxShadow: isSelected ? '0 0 16px rgba(59, 130, 246, 0.25)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div onClick={() => setSelectedNews(item)} style={{ flex: 1, cursor: 'pointer' }}>
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.06)', color: isSelected ? '#93c5fd' : '#6b7280', fontWeight: 600, display: 'inline-block', marginBottom: '4px', textTransform: 'uppercase' }}>{meta.label}</span>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: isSelected ? '#ffffff' : '#d1d5db', lineHeight: 1.4 }}>{item.title}</div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                    <a href={item.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: '11px', color: '#93c5fd', textDecoration: 'none', padding: '4px 8px', backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '6px', fontWeight: 600, whiteSpace: 'nowrap' }}>🔗 記事を読む</a>
                    <div onClick={() => setSelectedNews(item)} style={{ fontSize: '11px', color: isSelected ? '#60a5fa' : '#4b5563', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}><span>XR対象</span><span>{isSelected ? '●' : '○'}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* XR生成パネル（固定フッター） */}
      <div style={{
        position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)', maxWidth: '680px', backgroundColor: 'rgba(17, 24, 39, 0.92)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(147, 197, 253, 0.25)', borderRadius: '16px',
        padding: '14px 16px', boxShadow: '0 16px 36px rgba(0, 0, 0, 0.7), 0 0 24px rgba(59, 130, 246, 0.2)',
        boxSizing: 'border-box', zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '50%' }}>
            <span style={{ fontSize: '16px' }}>🔮</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#f3f4f6', whiteSpace: 'nowrap' }}>XRアセット生成</span>
            {selectedNews && (
              <span style={{ fontSize: '11px', color: '#c084fc', backgroundColor: 'rgba(192, 132, 252, 0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedNews.title}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', backgroundColor: '#030712', padding: '2px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <button onClick={() => setAssetType('2.5d')} style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', backgroundColor: assetType === '2.5d' ? '#374151' : 'transparent', color: assetType === '2.5d' ? '#ffffff' : '#9ca3af', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>2.5D (高速画像)</button>
            <button onClick={() => setAssetType('3d')} style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', backgroundColor: assetType === '3d' ? '#2563eb' : 'transparent', color: assetType === '3d' ? '#ffffff' : '#9ca3af', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>3D (GLB)</button>
          </div>
        </div>
        <button
          onClick={handleSummon} disabled={isSummoning || !selectedNews}
          style={{
            width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
            background: isSummoning ? '#374151' : (isPremium ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'linear-gradient(135deg, #a855f7 0%, #3b82f6 50%, #06b6d4 100%)'),
            color: '#ffffff', fontSize: '14px', fontWeight: 700, cursor: isSummoning || !selectedNews ? 'not-allowed' : 'pointer',
            boxShadow: isPremium ? '0 4px 16px rgba(245, 158, 11, 0.35)' : '0 4px 16px rgba(168, 85, 247, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', position: 'relative', overflow: 'hidden'
          }}
        >
          {isSummoning && assetType === '3d' && (
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', backgroundColor: 'rgba(255, 255, 255, 0.2)', width: `${progress}%`, transition: 'width 0.5s' }} />
          )}
          <span style={{ position: 'relative', zIndex: 10 }}>{isSummoning ? (assetType === '3d' ? `⏳ AIが3Dモデリング中... ${progress}%` : '⏳ AIが画像を生成中...') : '✨ 空間に召喚する'}</span>
        </button>
      </div>
    </div>
  );
}
