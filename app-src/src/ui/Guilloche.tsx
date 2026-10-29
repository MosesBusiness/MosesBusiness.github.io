import React, { useEffect, useRef } from 'react';

// A guilloché rosette, the fine interlaced line pattern printed on banknotes and watch dials.
// `richness` (0-1) thickens the pattern as savings grow; `converge` (0-1) collapses it into
// plain circles, used for the unlock moment.

export interface RosetteProps {
  size: number; petals?: number; richness?: number; alpha?: number; spin?: boolean;
  converge?: number; className?: string; style?: React.CSSProperties; tone?: 'foil' | 'warn';
}

export function Rosette({ size, petals = 30, richness = 0.6, alpha = 0.5, spin = true, converge = 0, className, style, tone = 'foil' }: RosetteProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ converge, richness, tone });
  live.current = { converge, richness, tone };

  useEffect(() => {
    const cv = ref.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = size * dpr; cv.height = size * dpr;
    cv.style.width = size + 'px'; cv.style.height = size + 'px';
    const ctx = cv.getContext('2d')!;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = 0, phase = 0, conv = live.current.converge;

    const colors = () => {
      const cs = getComputedStyle(document.documentElement);
      const g = (n: string) => cs.getPropertyValue(n).trim() || '#888';
      return live.current.tone === 'warn' ? [g('--spend'), g('--gold'), g('--spend'), g('--gold')] : [g('--foil-a'), g('--foil-b'), g('--foil-c'), g('--foil-d')];
    };

    const draw = (t: number) => {
      const target = live.current.converge;
      conv += (target - conv) * 0.08;
      const rich = live.current.richness;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const c = size / 2;
      const R = size * 0.36;
      const [a, b, cc, d] = colors();
      let grad: CanvasGradient | string = a;
      const anyCtx = ctx as any;
      if (typeof anyCtx.createConicGradient === 'function') {
        grad = anyCtx.createConicGradient(phase * 0.3, c, c);
        (grad as CanvasGradient).addColorStop(0, a); (grad as CanvasGradient).addColorStop(0.3, b);
        (grad as CanvasGradient).addColorStop(0.55, cc); (grad as CanvasGradient).addColorStop(0.8, d); (grad as CanvasGradient).addColorStop(1, a);
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.6;
      ctx.globalAlpha = alpha;
      const layers = Math.round(10 + rich * 16);
      const amp = size * (0.05 + rich * 0.06) * (1 - conv);
      const steps = 540;
      for (let L = 0; L < layers; L++) {
        const off = (L / layers) * Math.PI * 2 / petals;
        const rr = R * (0.78 + 0.22 * (L / layers));
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const th = (i / steps) * Math.PI * 2;
          const r = rr + amp * Math.sin(petals * th + off * petals + phase) + amp * 0.45 * Math.sin((petals / 2) * th - phase * 0.7 + L * 0.21);
          const x = c + r * Math.cos(th), y = c + r * Math.sin(th);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // inner micro-rosette
      ctx.globalAlpha = alpha * 0.7;
      for (let L = 0; L < 6; L++) {
        ctx.beginPath();
        const r0 = R * 0.33 + L * 2;
        for (let i = 0; i <= 360; i++) {
          const th = (i / 360) * Math.PI * 2;
          const r = r0 + (size * 0.018) * (1 - conv) * Math.sin(12 * th + L + phase * 1.3);
          const x = c + r * Math.cos(th), y = c + r * Math.sin(th);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      if (spin && !reduce) {
        if (t - last > 45) { phase += 0.012; last = t; }
        raf = requestAnimationFrame(draw);
      } else if (Math.abs(target - conv) > 0.01) {
        raf = requestAnimationFrame(draw);
      }
    };
    raf = requestAnimationFrame(draw);
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(draw); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
  }, [size, petals, alpha, spin]);

  return <canvas ref={ref} className={className} style={style} aria-hidden="true" />;
}
