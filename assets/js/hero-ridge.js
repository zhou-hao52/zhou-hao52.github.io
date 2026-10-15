/* ==========================================================================
   hero-ridge.js · 首屏「信号山脊」Canvas 2D 背景
   动态 import 加载；任何异常都交给调用方降级到静态 ridge.svg
   ========================================================================== */

const SEED = 20261015;

/** 固定种子的伪随机，保证每次生成的波形一致 */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 多阶正弦叠加，返回 [freq, phase, amp] 列表 */
function octaves(seed, n) {
  const r = rng(seed);
  const out = [];
  for (let k = 0; k < n; k++) {
    out.push({
      f: r() * 0.8 + 0.6 + k * 1.35 + r() * 0.5,
      p: r() * Math.PI * 2,
      a: 1 / Math.pow(1.72, k),
    });
  }
  const norm = out.reduce((s, o) => s + o.a, 0);
  out.forEach((o) => (o.a /= norm));
  return out;
}

const LAYERS = [
  // 后层：更高更缓，只描线
  { seed: SEED + 1, oct: 3, base: 0.6, amp: 0.14, speed: 0.00006, cols: 0.6, w: 1.0, op: 0.1, color: 'ink', fill: false },
  { seed: SEED + 2, oct: 4, base: 0.68, amp: 0.16, speed: 0.0001, cols: 0.8, w: 1.2, op: 0.2, color: 'luojia', fill: false },
  // 前层：更低更密，描线 + 渐变填充
  { seed: SEED + 3, oct: 5, base: 0.78, amp: 0.16, speed: 0.00016, cols: 1, w: 1.8, op: 0.9, color: 'signal', fill: true },
];

/* 列数下限必须足够大：前层最高频约 6～7 个周期，
   每周期少于 ~14 个采样点折线就会显出明显的棱角。 */
const MIN_COLS = 96;

/* 首屏底部信息带（.lower）是不透明纸白底，会遮住它后面的山脊。
   若山脊越到带子下方，露出部分就会断成互不相连的几段（看起来像画坏了）。
   因此山脊的取值区间整体限制在带子以上：预留 RESERVE 像素的高度余量。 */
const RESERVE = 215;

const TIER_CFG = {
  high: { dpr: 2, detail: 1 },
  balanced: { dpr: 1.5, detail: 0.6 },
  lite: { dpr: 1, detail: 0.35 },
};

export function mount(hero, canvas) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // auto 档：按设备能力与网络提示推断
  let tier = document.documentElement.dataset.tier || 'auto';
  if (tier === 'auto') {
    const conn = navigator.connection || {};
    const weak =
      (navigator.hardwareConcurrency || 8) <= 4 ||
      (navigator.deviceMemory || 8) <= 4 ||
      conn.saveData === true ||
      /2g|slow-2g/.test(conn.effectiveType || '');
    tier = weak ? 'lite' : 'balanced';
  }
  if (reduce) tier = 'lite';

  const cfg = TIER_CFG[tier] || TIER_CFG.balanced;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return false;

  const css = getComputedStyle(document.documentElement);
  const COL = {
    paper: css.getPropertyValue('--paper').trim() || '#f1efea',
    ink: css.getPropertyValue('--ink').trim() || '#121212',
    signal: css.getPropertyValue('--signal').trim() || '#e5482d',
    luojia: css.getPropertyValue('--luojia').trim() || '#2f5d50',
  };

  const waves = LAYERS.map((L) => ({
    ...L,
    // 低档位减少正弦阶数（而非列数）来省 CPU，避免折线变棱角
    osc: octaves(L.seed, Math.max(2, Math.round(1 + (L.oct - 1) * cfg.detail))),
  }));

  let W = 0;
  let H = 0;
  let cols = 0;
  let raf = 0;
  let t0 = performance.now();
  let phase = 0;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let visible = true;

  function resize() {
    const r = hero.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    const dpr = Math.min(cfg.dpr, window.devicePixelRatio || 1) * (W > 1400 ? 1 : 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.round(Math.max(MIN_COLS, Math.min(W / 5, 240)));
  }

  function heightAt(L, x, ph) {
    const t = x / W;
    let v = 0;
    for (const o of L.osc) {
      v += o.a * Math.sin(Math.PI * 2 * o.f * t + o.p + ph * L.speed * 1e3);
    }
    const usable = Math.max(140, H - RESERVE);
    return (L.base - v * L.amp) * usable;
  }

  function drawLayer(L, ph) {
    const n = Math.max(16, Math.round(cols * L.cols));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = (W * i) / n;
      pts.push([x, heightAt(L, x, ph)]);
    }
    const stroke = COL[L.color] || COL.signal;

    if (L.fill) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, hexA(COL.signal, 0.14));
      g.addColorStop(0.55, hexA(COL.signal, 0.05));
      g.addColorStop(1, hexA(COL.signal, 0));
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.strokeStyle = hexA(stroke, L.op);
    ctx.lineWidth = L.w;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // 前层：在脊线上打信号节点
    if (L.fill) {
      const step = Math.max(1, Math.round(n / 22));
      for (let i = step; i < n; i += step) {
        const [x, y] = pts[i];
        ctx.beginPath();
        ctx.arc(x, y, 2.3, 0, Math.PI * 2);
        ctx.fillStyle = COL.paper;
        ctx.fill();
        ctx.strokeStyle = hexA(COL.signal, 0.85);
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!visible) return;
    phase = reduce ? 0 : now - t0;

    // 指针视差缓动
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(mouse.x * 12, mouse.y * 8);
    for (const L of waves) drawLayer(L, phase);
    ctx.restore();
  }

  /* 调试探针：把绘制范围写回 canvas.dataset，便于无头环境核对 */
  function debugStats(ph) {
    const out = waves.map((L) => {
      const n = Math.max(16, Math.round(cols * L.cols));
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i <= n; i++) {
        const y = heightAt(L, (W * i) / n, ph);
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
      return `${L.color}:${Math.round(lo)}..${Math.round(hi)}(n=${n})`;
    });
    return `W=${Math.round(W)} H=${Math.round(H)} cols=${cols} | ${out.join(' ')}`;
  }

  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const s =
      h.length === 3
        ? h
            .split('')
            .map((c) => c + c)
            .join('')
        : h;
    const n = parseInt(s.slice(0, 6), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // 指针视差
  const onMove = (e) => {
    const r = hero.getBoundingClientRect();
    mouse.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    mouse.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  // 离开视口即停，省电
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (es) => {
        visible = es[0].isIntersecting;
        if (visible) t0 = performance.now() - phase;
      },
      { threshold: 0 }
    ).observe(hero);
  }
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden && visible !== false ? !document.hidden : visible;
  });

  // 尺寸变化重建
  if ('ResizeObserver' in window) {
    let rid = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(rid);
      rid = requestAnimationFrame(() => {
        resize();
      });
    }).observe(hero);
  } else {
    window.addEventListener('resize', resize);
  }

  // 档位切换时重建
  window.addEventListener('tierchange', () => location.reload());

  resize();
  canvas.dataset.dbg = debugStats(0);
  if (reduce) {
    // 降低动态效果时只画一帧静态图
    for (const L of waves) drawLayer(L, 0);
    return true;
  }
  raf = requestAnimationFrame(frame);
  return true;
}
