// AR写真：カメラ映像 + 3Dモデル + エフェクト + ロゴ（無料版のみ）を1枚に合成する

function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, w: number, h: number) {
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export async function capturePhoto(opts: {
  viewer: any; // <model-viewer>
  video?: HTMLVideoElement | null; // 現実空間モードのカメラ映像
  effect?: HTMLCanvasElement | null;
  watermark: boolean;
  caption?: string;
}): Promise<Blob> {
  const { viewer, video, effect, watermark, caption } = opts;
  const rect = (viewer as HTMLElement).getBoundingClientRect();
  const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 2)); // 高画質で保存
  const w = Math.round(rect.width * scale);
  const h = Math.round(rect.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // 背景：カメラ映像（なければグラデーション）
  if (video && video.videoWidth) {
    drawCover(ctx, video, video.videoWidth, video.videoHeight, w, h);
  } else {
    const g = ctx.createRadialGradient(w / 2, h * 0.85, 0, w / 2, h * 0.85, h);
    g.addColorStop(0, '#1e3a8a');
    g.addColorStop(1, '#0b0f19');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // 3Dモデル（model-viewer は背景透過の画像を出せる）
  const blob: Blob = await viewer.toBlob({ mimeType: 'image/png', idealAspect: false });
  const bmp = await createImageBitmap(blob);
  ctx.drawImage(bmp, 0, 0, w, h);

  if (effect && effect.width > 1) ctx.drawImage(effect, 0, 0, w, h);

  const fs = Math.round(h * 0.028);
  if (caption) {
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, w, fs * 2.2);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(caption.slice(0, 40), fs * 0.8, fs * 1.1, w - fs * 1.6);
  }

  if (watermark) {
    const text = '🔮 News Summoner';
    ctx.font = `800 ${Math.round(fs * 1.3)}px system-ui, sans-serif`;
    const tw = ctx.measureText(text).width;
    const pad = fs * 0.7;
    ctx.fillStyle = 'rgba(11,15,25,0.65)';
    ctx.fillRect(w - tw - pad * 3, h - fs * 3.2, tw + pad * 2, fs * 2.2);
    ctx.fillStyle = '#e9d5ff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w - tw - pad * 2, h - fs * 2.1);
  }

  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92));
}
