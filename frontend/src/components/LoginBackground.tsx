import React, { useEffect, useRef } from 'react';

interface LoginBackgroundProps {
  isDark: boolean;
}

interface Ribbon {
  yBase: number;
  thickness: number;
  k1: number;
  k2: number;
  a1: number;
  a2: number;
  s1: number;
  s2: number;
  phase: number;
  hue: number;
  alpha: number;
}

const LoginBackground: React.FC<LoginBackgroundProps> = ({ isDark }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const darkRef = useRef(isDark);
  darkRef.current = isDark;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;

    const ribbons: Ribbon[] = [
      { yBase: 0.74, thickness: 110, k1: 0.0042, k2: 0.0095, a1: 52, a2: 24, s1: 0.32, s2: 0.18, phase: 0.4, hue: 30, alpha: 0.16 },
      { yBase: 0.86, thickness: 150, k1: 0.0032, k2: 0.0074, a1: 64, a2: 30, s1: 0.22, s2: 0.14, phase: 2.2, hue: 12, alpha: 0.13 },
      { yBase: 0.62, thickness: 70, k1: 0.0058, k2: 0.0125, a1: 38, a2: 18, s1: 0.4, s2: 0.26, phase: 4.4, hue: 42, alpha: 0.12 },
    ];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(0);
    };

    const ribbonEdge = (r: Ribbon, x: number, t: number) =>
      r.yBase * h +
      Math.sin(x * r.k1 + t * r.s1 + r.phase) * r.a1 +
      Math.sin(x * r.k2 - t * r.s2) * r.a2;

    const render = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const dark = darkRef.current;
      const alphaScale = dark ? 1.3 : 1;
      for (const r of ribbons) {
        const hue = r.hue + Math.sin(t * 0.25 + r.phase) * 8;
        let minY = Infinity;
        let maxY = -Infinity;
        ctx.beginPath();
        for (let x = -60; x <= w + 60; x += 18) {
          const y = ribbonEdge(r, x, t);
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (x === -60) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let x = w + 60; x >= -60; x -= 18) {
          const y = ribbonEdge(r, x, t + 0.6) + r.thickness;
          if (y > maxY) maxY = y;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, minY, 0, maxY);
        const a = r.alpha * alphaScale;
        grad.addColorStop(0, `hsla(${hue}, 95%, 58%, 0)`);
        grad.addColorStop(0.35, `hsla(${hue}, 95%, 58%, ${a})`);
        grad.addColorStop(0.7, `hsla(${hue + 14}, 90%, 55%, ${a * 0.85})`);
        grad.addColorStop(1, `hsla(${hue + 14}, 90%, 55%, 0)`);
        ctx.fillStyle = grad;
        ctx.fill();
      }
    };

    resize();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="login-canvas" aria-hidden="true" />;
};

export default LoginBackground;
