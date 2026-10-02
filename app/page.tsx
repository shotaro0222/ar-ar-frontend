'use client';

import React, { useState } from 'react';

const newsData = {
  it: {
    label: 'IT',
    icon: '⚡',
    items: [
      { id: 'it-1', title: '流行語ドパガキどう広がった 分析', tag: 'AI分析', arKeyword: 'ドパガキ 3D' },
      { id: 'it-2', title: '高性能AI普及へ 年内に行動計画', tag: 'AI / テック', arKeyword: '次世代AIサーバーホログラム' },
      { id: 'it-3', title: 'セコマ個人情報漏えい 第三者閲覧', tag: 'セキュリティ', arKeyword: 'サイバーセキュリティノード' },
    ]
  },
  business: {
    label: 'Business',
    icon: '📈',
    items: [
      { id: 'b-1', title: '東北3地銀 28年4月統合向け協議へ', tag: '金融', arKeyword: '統合銀行ビル 3D' },
      { id: 'b-2', title: '佐川急便 宅配便平均13%値上げへ', tag: '物流', arKeyword: '配送トラック 3D' },
      { id: 'b-3', title: '東海汽船 一部船舶の使用停止処分', tag: '海運', arKeyword: '大型客船ホログラム' },
    ]
  },
  entertainment: {
    label: 'Entertainment',
    icon: '🎬',
    items: [
      { id: 'e-1', title: '宮根誠司「ミヤネ屋」最終回で涙', tag: 'TV', arKeyword: 'TVスタジオ 3D' },
      { id: 'e-2', title: '綾瀬はるか 天然発言で会場沸かす', tag: '芸能', arKeyword: 'ステージスポットライト' },
      { id: 'e-3', title: 'ミヤネ屋最終回 20年の歴史に幕', tag: 'メディア', arKeyword: '20周年記念トロフィー' },
    ]
  }
};

export default function HomePage() {
  const [activeCategory, setActiveCategory] = useState<'it' | 'business' | 'entertainment'>('it');
  const [selectedNews, setSelectedNews] = useState<string>('it-1');
  const [assetType, setAssetType] = useState<'2.5d' | '3d'>('3d');
  const [isSummoning, setIsSummoning] = useState(false);

  const currentNews = Object.values(newsData)
    .flatMap(cat => cat.items)
    .find(item => item.id === selectedNews);

  const handleSummon = () => {
    setIsSummoning(true);
    setTimeout(() => {
      setIsSummoning(false);
      alert(`「${currentNews?.arKeyword}」をAR空間に召喚しました！`);
    }, 1000);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0b0f19',
      color: '#f3f4f6',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '24px 16px 140px 16px',
      maxWidth: '720px',
      margin: '0 auto',
      boxSizing: 'border-box'
    }}>
      {/* ヘッダー */}
      <header style={{ marginBottom: '28px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 12px',
          borderRadius: '9999px',
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          color: '#60a5fa',
          fontSize: '11px',
          fontWeight: 700,
          marginBottom: '12px',
          letterSpacing: '0.08em'
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3b82f6', boxShadow: '0 0 8px #3b82f6' }}></span>
          AR VISION PORTAL
        </div>
        <h1 style={{
          fontSize: '26px',
          fontWeight: 800,
          margin: '0 0 10px 0',
          background: 'linear-gradient(135deg, #ffffff 0%, #93c5fd 50%, #c084fc 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          lineHeight: 1.3
        }}>
          最新ニュース &amp; AR拡張記事
        </h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>
          記事内のキーワードから、直接AR空間に3Dオブジェクトや情景を召喚できます。
        </p>
      </header>

      {/* カテゴリタブ */}
      <div style={{
        display: 'flex',
        gap: '6px',
        marginBottom: '20px',
        padding: '4px',
        backgroundColor: '#111827',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.08)'
      }}>
        {(Object.keys(newsData) as Array<keyof typeof newsData>).map((key) => {
          const category = newsData[key];
          const isActive = activeCategory === key;
          return (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'transparent',
                color: isActive ? '#ffffff' : '#9ca3af',
                fontWeight: isActive ? 700 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <span>{category.icon}</span>
              <span style={{ textTransform: 'uppercase' }}>{key}</span>
            </button>
          );
        })}
      </div>

      {/* ニュースリスト */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px' }}>
        {newsData[activeCategory].items.map((item) => {
          const isSelected = selectedNews === item.id;
          return (
            <div
              key={item.id}
              onClick={() => setSelectedNews(item.id)}
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                backgroundColor: isSelected ? 'rgba(30, 41, 59, 0.9)' : '#111827',
                border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.05)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isSelected ? '0 0 16px rgba(59, 130, 246, 0.25)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}
            >
              <div style={{ flex: 1 }}>
                <span style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                  color: isSelected ? '#93c5fd' : '#6b7280',
                  fontWeight: 600,
                  display: 'inline-block',
                  marginBottom: '4px'
                }}>
                  {item.tag}
                </span>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: isSelected ? '#ffffff' : '#d1d5db',
                  lineHeight: 1.4
                }}>
                  {item.title}
                </div>
              </div>
              <div style={{
                fontSize: '11px',
                color: isSelected ? '#60a5fa' : '#4b5563',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <span>AR</span>
                <span>{isSelected ? '●' : '○'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ARアセット生成パネル */}
      <div style={{
        position: 'fixed',
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: '680px',
        backgroundColor: 'rgba(17, 24, 39, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(147, 197, 253, 0.25)',
        borderRadius: '16px',
        padding: '14px 16px',
        boxShadow: '0 16px 36px rgba(0, 0, 0, 0.7), 0 0 24px rgba(59, 130, 246, 0.2)',
        boxSizing: 'border-box'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '16px' }}>🔮</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#f3f4f6' }}>ARアセット生成</span>
            {currentNews && (
              <span style={{
                fontSize: '11px',
                color: '#c084fc',
                backgroundColor: 'rgba(192, 132, 252, 0.15)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 600
              }}>
                {currentNews.arKeyword}
              </span>
            )}
          </div>

          <div style={{
            display: 'flex',
            backgroundColor: '#030712',
            padding: '2px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <button
              onClick={() => setAssetType('2.5d')}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: assetType === '2.5d' ? '#374151' : 'transparent',
                color: assetType === '2.5d' ? '#ffffff' : '#9ca3af',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              2.5D (高速画像)
            </button>
            <button
              onClick={() => setAssetType('3d')}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: assetType === '3d' ? '#2563eb' : 'transparent',
                color: assetType === '3d' ? '#ffffff' : '#9ca3af',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              3D (GLB)
            </button>
          </div>
        </div>

        <button
          onClick={handleSummon}
          disabled={isSummoning}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '10px',
            border: 'none',
            background: isSummoning
              ? '#374151'
              : 'linear-gradient(135deg, #a855f7 0%, #3b82f6 50%, #06b6d4 100%)',
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: 700,
            cursor: isSummoning ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 16px rgba(168, 85, 247, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <span>{isSummoning ? '⏳ 召喚中...' : '✨ 空間に召喚する'}</span>
        </button>
      </div>
    </div>
  );
}
