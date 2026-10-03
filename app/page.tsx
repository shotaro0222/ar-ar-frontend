'use client';

import React, { useState, useEffect } from 'react';
import Script from 'next/script';

// オモシロ(funny)のラベルを修正
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
      minHeight: '100vh',
      backgroundColor: '#0b0f19',
      color: '#f3f4f6',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '24px 16px 200px 16px',
      maxWidth: '720px',
      margin: '0 auto',
      boxSizing: 'border-box',
      position: 'relative'
    }}>
      
      {/* 3Dモデルタップ時の白枠（フォーカスリング）を消すCSSを埋め込み */}
      <style dangerouslySetInnerHTML={{__html: `
        model-viewer:focus { outline: none; }
        model-viewer { --poster-color: transparent; }
      `}} />

      <Script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js" />

      {isDesktop && currentUrl && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', width: '220px',
          backgroundColor: 'rgba(17, 24, 39, 0.9)', backdropFilter: 'blur(8px)',
          padding: '16px', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.3)',
          textAlign: 'center', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)', zIndex: 50
        }}>
          <div style={{ fontSize: '13px', color: '#93c5fd', fontWeight: 800, marginBottom: '8px' }}>
            📱 スマホでAR体験！
          </div>
          <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '12px', lineHeight: 1.4 }}>
            スマホのカメラでQRコードを読み込むと、現実空間にニュースを召喚できます。
          </p>
          <div style={{ padding: '8px', backgroundColor: '#fff', borderRadius: '12px', display: 'inline-block' }}>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentUrl)}`} alt="QR Code" style={{ width: '150px', height: '150px', display: 'block' }} />
          </div>
        </div>
      )}

      <header style={{ marginBottom: '28px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px',
          borderRadius: '9999px', backgroundColor: 'rgba(59, 130, 246, 0.12)',
          border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', fontSize: '11px',
          fontWeight: 700, marginBottom: '12px', letterSpacing: '0.08em'
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3b82f6', boxShadow: '0 0 8px #3b82f6' }}></span>
          HoloNews
        </div>
        <h1 style={{
          fontSize: '26px', fontWeight: 800, margin: '0 0 10px 0',
          background: 'linear-gradient(135deg, #ffffff 0%, #93c5fd 50%, #c084fc 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.3
        }}>
          最新ニュース &amp; AR拡張
        </h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>
          実際のニュースを選択して、記事の世界をAR空間に召喚できます。
        </p>
      </header>

      {!newsData ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px' }}>
          最新のニュースを読み込んでいます...
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex', gap: '6px', marginBottom: '20px', padding: '4px',
            backgroundColor: '#111827', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)',
            overflowX: 'auto'
          }}>
            {categories.map((key) => {
              const isActive = activeCategory === key;
              const meta = categoryMeta[key] || { label: key, icon: '📰' };
              return (
                <button
                  key={key}
                  onClick={() => {
                    setActiveCategory(key);
                    setSelectedNews(newsData[key][0]);
                  }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                    background: isActive ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'transparent',
                    color: isActive ? '#ffffff' : '#9ca3af', fontWeight: isActive ? 700 : 500,
                    fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s ease',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap'
                  }}
                >
                  <span>{meta.icon}</span>
                  <span style={{ textTransform: 'uppercase' }}>{meta.label}</span>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px' }}>
            {newsData[activeCategory]?.map((item: any, idx: number) => {
              const isSelected = selectedNews?.url === item.url && selectedNews?.title === item.title;
              const meta = categoryMeta[activeCategory] || { label: activeCategory };
              
              return (
                <div
                  key={idx}
                  style={{
                    padding: '14px 16px', borderRadius: '12px',
                    backgroundColor: isSelected ? 'rgba(30, 41, 59, 0.9)' : '#111827',
                    border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.05)',
                    transition: 'all 0.2s ease', boxShadow: isSelected ? '0 0 16px rgba(59, 130, 246, 0.25)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'
                  }}
                >
                  <div onClick={() => setSelectedNews(item)} style={{ flex: 1, cursor: 'pointer' }}>
                    <span style={{
                      fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                      color: isSelected ? '#93c5fd' : '#6b7280', fontWeight: 600,
                      display: 'inline-block', marginBottom: '4px', textTransform: 'uppercase'
                    }}>
                      {meta.label}
                    </span>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: isSelected ? '#ffffff' : '#d1d5db', lineHeight: 1.4 }}>
                      {item.title}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                    <a
                      href={item.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                      style={{
                        fontSize: '11px', color: '#93c5fd', textDecoration: 'none', padding: '4px 8px',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '6px', fontWeight: 600, whiteSpace: 'nowrap'
                      }}
                    >
                      🔗 記事を読む
                    </a>
                    <div onClick={() => setSelectedNews(item)} style={{ fontSize: '11px', color: isSelected ? '#60a5fa' : '#4b5563', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>AR対象</span>
                      <span>{isSelected ? '●' : '○'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {assetUrl && (
        <div style={{
          marginBottom: '20px', padding: '16px', backgroundColor: '#111827',
          borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.3)', textAlign: 'center'
        }}>
          <h3 style={{ fontSize: '13px', color: '#93c5fd', margin: '0 0 12px 0' }}>生成完了</h3>
          {assetType === '2.5d' ? (
            <img src={assetUrl} alt="2.5D Asset" style={{ maxWidth: '100%', maxHeight: '250px', borderRadius: '8px' }} />
          ) : (
            <>
              {/* 白枠対策の outline: 'none' をインラインでも追加 */}
              {/* @ts-ignore */}
              <model-viewer 
                src={assetUrl} 
                ar 
                ar-modes="webxr scene-viewer quick-look" 
                auto-rotate 
                camera-controls 
                style={{ width: '100%', height: '250px', outline: 'none', backgroundColor: 'transparent' }} 
              />
              
              {isDesktop && (
                <p style={{ fontSize: '11px', color: '#fbbf24', marginTop: '12px', lineHeight: 1.4 }}>
                  ⚠️ PCでは3Dプレビューのみ可能です。<br/>空間への配置（AR体験）は右上のQRコードからスマホでアクセスしてください。
                </p>
              )}
            </>
          )}
        </div>
      )}

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
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#f3f4f6', whiteSpace: 'nowrap' }}>AR生成</span>
            {selectedNews && (
              <span style={{
                fontSize: '11px', color: '#c084fc', backgroundColor: 'rgba(192, 132, 252, 0.15)',
                padding: '2px 6px', borderRadius: '4px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                {selectedNews.title}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', backgroundColor: '#030712', padding: '2px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <button onClick={() => setAssetType('2.5d')} style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', backgroundColor: assetType === '2.5d' ? '#374151' : 'transparent', color: assetType === '2.5d' ? '#ffffff' : '#9ca3af', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
              2.5D (高速画像)
            </button>
            <button onClick={() => setAssetType('3d')} style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', backgroundColor: assetType === '3d' ? '#2563eb' : 'transparent', color: assetType === '3d' ? '#ffffff' : '#9ca3af', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
              3D (GLB)
            </button>
          </div>
        </div>

        <button
          onClick={handleSummon} disabled={isSummoning || !selectedNews}
          style={{
            width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
            background: isSummoning ? '#374151' : 'linear-gradient(135deg, #a855f7 0%, #3b82f6 50%, #06b6d4 100%)',
            color: '#ffffff', fontSize: '14px', fontWeight: 700, cursor: isSummoning || !selectedNews ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 16px rgba(168, 85, 247, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', position: 'relative', overflow: 'hidden'
          }}
        >
          {isSummoning && assetType === '3d' && (
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', backgroundColor: 'rgba(255, 255, 255, 0.2)', width: `${progress}%`, transition: 'width 0.5s' }} />
          )}
          <span style={{ position: 'relative', zIndex: 10 }}>
            {isSummoning ? (assetType === '3d' ? `⏳ AIが3Dモデリング中... ${progress}%` : '⏳ AIが画像を生成中...') : '✨ 空間に召喚する'}
          </span>
        </button>
      </div>
    </div>
  );
}