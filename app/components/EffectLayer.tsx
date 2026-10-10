'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// 3Dモデルの周りに出すプレミアム演出。canvas に描くので、AR写真にもそのまま合成できる
export type EffectKind = 'none' | 'fire' | 'glitch' | 'magic';

export const EFFECTS: { id: EffectKind; label: string; icon: string }[] = [
  { id: 'none', label: 'なし', icon: '⭕' },
  { id: 'fire', label: '炎', icon: '🔥' },
  { id: 'glitch', label: 'サイバー', icon: '⚡' },
  { id: 'magic', label: '魔法陣', icon: '🔮' }
];

export const MAGIC_COLORS = ['#a855f7', '#22d3ee', '#f59e0b', '#ef4444', '#22c55e', '#f472b6'];

type Particle = { x: number; y: number; vx: number; vy: number; life: number; size: number };

const EffectLayer = forwardRef<HTMLCanvasElement | null, { effect: EffectKind; color: string }>(function EffectLayer({ effect, color }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useImperativeHandle(ref, () => canvasRef.current as HTMLCanvasElement);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const particles: Particle[] = [];
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let t = 0;

    const draw = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const baseY = h * 0.9;

      if (effect === 'fire') {
        for (let i = 0; i < 4; i++) {
          particles.push({
            x: cx + (Math.random() - 0.5) * w * 0.45,
            y: baseY,
            vx: (Math.random() - 0.5) * 0.6,
            vy: -1.2 - Math.random() * 2.2,
            life: 1,
            size: 6 + Math.random() * 14
          });
        }
        ctx.globalCompositeOperation = 'lighter';
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx + Math.sin((t + i) * 0.05) * 0.4;
          p.y += p.vy;
          p.life -= 0.012;
          if (p.life <= 0 || p.y < h * 0.15) { particles.splice(i, 1); continue; }
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * p.life + 1);
          g.addColorStop(0, `rgba(255,240,180,${0.55 * p.life})`);
          g.addColorStop(0.4, `rgba(255,140,30,${0.4 * p.life})`);
          g.addColorStop(1, 'rgba(200,30,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life + 1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      if (effect === 'glitch') {
        ctx.fillStyle = 'rgba(0,255,255,0.05)';
        for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
        if (Math.random() < 0.35) {
          for (let i = 0; i < 5; i++) {
            const y = Math.random() * h;
            const bh = 2 + Math.random() * 14;
            ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,0,170,0.35)' : 'rgba(0,255,255,0.35)';
            ctx.fillRect(Math.random() * w * 0.3, y, w * (0.3 + Math.random() * 0.6), bh);
          }
        }
        ctx.strokeStyle = 'rgba(0,255,255,0.7)';
        ctx.lineWidth = 2;
        const s = 18;
        const m = 14;
        [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]].forEach(([x, y, dx, dy]) => {
          ctx.beginPath();
          ctx.moveTo(x, y + dy * s); ctx.lineTo(x, y); ctx.lineTo(x + dx * s, y);
          ctx.stroke();
        });
      }

      if (effect === 'magic') {
        const r = Math.min(w * 0.42, h * 0.5);
        ctx.save();
        ctx.translate(cx, baseY);
        ctx.scale(1, 0.32); // 床に置いたように見せる
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.rotate((reduce ? 0 : t) * 0.01);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const a = (i * 4 * Math.PI) / 6 - Math.PI / 2;
          const x = Math.cos(a) * r * 0.8;
          const y = Math.sin(a) * r * 0.8;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          ctx.fillStyle = color;
          ctx.fillRect(Math.cos(a) * r * 0.91 - 2, Math.sin(a) * r * 0.91 - 2, 4, 4);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        // 立ちのぼる光
        if (!reduce && Math.random() < 0.5) particles.push({ x: cx + (Math.random() - 0.5) * r * 1.6, y: baseY, vx: 0, vy: -1 - Math.random(), life: 1, size: 2 + Math.random() * 2 });
        ctx.fillStyle = color;
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.y += p.vy; p.life -= 0.01;
          if (p.life <= 0) { particles.splice(i, 1); continue; }
          ctx.globalAlpha = p.life;
          ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        ctx.globalAlpha = 1;
      }

      if (effect !== 'none') raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); ctx.clearRect(0, 0, w, h); };
  }, [effect, color]);

  return <canvas ref={canvasRef} className="ns-effect" aria-hidden="true" />;
});

export default EffectLayer;
