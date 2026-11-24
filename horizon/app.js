/* ---------------------------------------------------------------------------
 *  Time of day.
 *
 *  The reference scene is a single fixed sunset. Its sky is a shader with a full
 *  parametric palette (uZenith / uMid / uLowSun / uLowAnti / uHorSun / uHorAnti /
 *  uSunGlow / uSunDisc / uCloudLit / uCloudGold / uCloudDark / uStarAmt), but
 *  nothing ever changes it, and the sun direction is a constant that the render
 *  loop re-applies every frame from the ship's position.
 *
 *  Integration surface, and nothing else:
 *    · one patched line reads `window.__SUN_DIR || Id` for the light direction
 *    · this file writes that vector, the light's colour/intensity, and the sky +
 *      ocean palette uniforms
 *  No scene code is edited beyond that single line.
 *
 *  DUSK is not hard-coded: it is snapshotted from the live scene at boot, so the
 *  default state is byte-identical to upstream. The other three presets only
 *  override the keys listed; everything else falls back to the snapshot.
 * ------------------------------------------------------------------------- */
(() => {
  const DEFAULTS = 2;        // DUSK
  const AUTO_SPEED = 0.05;   // presets per second (~20 s per step)

  // Keys we must not interpolate: the cloud drift is animated by the scene.
  const SKIP = new Set(['uCloudOff', 'uSunDir']);

  const $ = (id) => document.getElementById(id);

  // The range fill is a CSS gradient on --fill. The panel script paints it on
  // input; the auto cycle moves the same slider without any input event, so it
  // has to paint too or the yellow bar freezes while the thumb walks.
  function paintFill(el) {
    if (!el) return;
    const lo = +el.min || 0, hi = +el.max || 3;
    el.style.setProperty('--fill', ((+el.value - lo) / (hi - lo)) * 100 + '%');
  }

  let ship = null;
  let skyMats = [];
  let dusk = null;           // snapshot of the reference palette
  let t = DEFAULTS, target = DEFAULTS, auto = false;
  let sunV = null;
  const lampBase = { material: null, glass: null, materialEI: 0, glassEI: 0, lights: [] };

  const OVERRIDES = [
    {
      key: 'DAWN', clock: '05:47', lamp: 0.50,
      // sun: just above the horizon, ahead and to the right
      sun: { dir: [0.74, 0.075, 0.67], color: [1.00, 0.72, 0.55], intensity: 2.3 },
      sky: {
        uZenith: [0.085, 0.150, 0.330],
        uMid: [0.290, 0.345, 0.505],
        uLowSun: [1.45, 0.92, 0.62],
        uLowAnti: [0.400, 0.420, 0.560],
        uHorSun: [1.65, 1.02, 0.70],
        uHorAnti: [0.460, 0.480, 0.600],
        uSunGlow: [1.65, 0.82, 0.42],
        uSunDisc: [42, 34, 25],
        uCloudLit: [1.45, 0.88, 0.60],
        uCloudGold: [2.90, 1.50, 0.72],
        uCloudDark: [0.095, 0.072, 0.098],
        uStarAmt: 0.18,
      },
      ocean: {
        uSunColor: [2.55, 1.70, 1.28],
        uAmbient: [0.215, 0.200, 0.275],
        uDeep: [0.0080, 0.0340, 0.0540],
        uSSS: [0.050, 0.275, 0.300],
      },
    },
    {
      key: 'NOON', clock: '12:31', lamp: 0.00,
      sun: { dir: [0.52, 0.70, 0.49], color: [1.00, 0.96, 0.90], intensity: 4.1 },
      sky: {
        uZenith: [0.095, 0.285, 0.720],
        uMid: [0.330, 0.530, 0.840],
        uLowSun: [1.18, 1.26, 1.34],
        uLowAnti: [0.540, 0.665, 0.870],
        uHorSun: [1.48, 1.52, 1.58],
        uHorAnti: [0.610, 0.725, 0.890],
        uSunGlow: [2.10, 2.00, 1.85],
        uSunDisc: [78, 76, 72],
        uCloudLit: [2.55, 2.55, 2.50],
        uCloudGold: [2.75, 2.65, 2.45],
        uCloudDark: [0.295, 0.335, 0.415],
        uStarAmt: 0.0,
      },
      ocean: {
        uSunColor: [4.60, 4.15, 3.55],
        uAmbient: [0.300, 0.330, 0.395],
        uDeep: [0.0060, 0.0450, 0.0720],
        uSSS: [0.030, 0.300, 0.340],
      },
    },
    {
      key: 'DUSK', clock: '18:52', lamp: 1.00,
      sun: { dir: [0.66, 0.100, 0.745], color: [1.00, 0.60, 0.34], intensity: 3.3 },
      sky: null,      // null = the live snapshot, untouched
      ocean: {
        uSunColor: [3.60, 1.90, 0.95],
        uAmbient: [0.200, 0.150, 0.240],
        uDeep: [0.0060, 0.0300, 0.0480],
        uSSS: [0.035, 0.300, 0.270],
      },
    },
    {
      key: 'NIGHT', clock: '23:14', lamp: 1.00,
      sun: { dir: [0.60, 0.130, 0.79], color: [0.58, 0.68, 1.00], intensity: 0.62 },
      sky: {
        uZenith: [0.0055, 0.0090, 0.0270],
        uMid: [0.0110, 0.0190, 0.0520],
        uLowSun: [0.100, 0.125, 0.215],
        uLowAnti: [0.0180, 0.0260, 0.0520],
        uHorSun: [0.090, 0.118, 0.200],
        uHorAnti: [0.0230, 0.0330, 0.0620],
        uSunGlow: [0.210, 0.270, 0.440],
        uSunDisc: [2.8, 3.2, 4.0],
        uCloudLit: [0.098, 0.115, 0.175],
        uCloudGold: [0.150, 0.170, 0.250],
        uCloudDark: [0.0040, 0.0060, 0.0120],
        uStarAmt: 1.0,
      },
      ocean: {
        uSunColor: [0.34, 0.44, 0.78],
        uAmbient: [0.095, 0.110, 0.185],
        uDeep: [0.0018, 0.0075, 0.0165],
        uSSS: [0.012, 0.075, 0.135],
      },
    },
  ];

  // ---------------------------------------------------------------- snapshot
  function snapshotSky() {
    const m = skyMats[0];
    const out = {};
    for (const [k, u] of Object.entries(m.uniforms)) {
      if (SKIP.has(k)) continue;
      const v = u && u.value !== undefined ? u.value : u;
      if (typeof v === 'number') out[k] = v;
      else if (v && v.isVector3) out[k] = [v.x, v.y, v.z];
      else if (v && v.isVector2) out[k] = [v.x, v.y];
      else if (v && (v.isColor || v.isVector4)) out[k] = [v.r ?? v.x, v.g ?? v.y, v.b ?? v.z];
    }
    return out;
  }

  function lerp(a, b, u) {
    if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => x + (b[i] - x) * u);
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * u;
    return u < 0.5 ? a : b;
  }

  function sample() {
    const c = Math.min(Math.max(t, 0), OVERRIDES.length - 1);
    const i = Math.min(Math.floor(c), OVERRIDES.length - 2);
    const u = c - i;
    const A = OVERRIDES[i], B = OVERRIDES[i + 1];
    const base = dusk;

    const sky = {};
    for (const k of Object.keys(base)) {
      const a = (A.sky && A.sky[k] !== undefined) ? A.sky[k] : base[k];
      const b = (B.sky && B.sky[k] !== undefined) ? B.sky[k] : base[k];
      sky[k] = lerp(a, b, u);
    }
    const ocean = {};
    for (const k of Object.keys(A.ocean)) {
      ocean[k] = lerp(A.ocean[k], B.ocean[k], u);
    }
    return {
      sky, ocean,
      dir: lerp(A.sun.dir, B.sun.dir, u),
      color: lerp(A.sun.color, B.sun.color, u),
      intensity: A.sun.intensity + (B.sun.intensity - A.sun.intensity) * u,
      lamp: A.lamp + (B.lamp - A.lamp) * u,
      key: u < 0.5 ? A.key : B.key,
      clock: u < 0.5 ? A.clock : B.clock,
    };
  }

  function apply() {
    if (!ship || !dusk) return;
    const s = sample();

    const L = Math.hypot(s.dir[0], s.dir[1], s.dir[2]) || 1;
    if (!sunV) sunV = { x: 0, y: 0, z: 0 };
    sunV.x = s.dir[0] / L; sunV.y = s.dir[1] / L; sunV.z = s.dir[2] / L;
    window.__SUN_DIR = sunV;

    const light = ship.sun;
    if (light) {
      if (light.color) light.color.setRGB(s.color[0], s.color[1], s.color[2]);
      light.intensity = s.intensity;
    }

    for (const mat of skyMats) {
      const U = mat.uniforms;
      for (const [k, v] of Object.entries(s.sky)) {
        const u = U[k];
        if (!u) continue;
        if (Array.isArray(v) && u.value && u.value.set) u.value.set(v[0], v[1], v[2]);
        else if (typeof v === 'number') u.value = v;
      }
      if (U.uSunDir && U.uSunDir.value && U.uSunDir.value.set) {
        U.uSunDir.value.set(sunV.x, sunV.y, sunV.z);
      }
    }

    if (lampBase.material) lampBase.material.emissiveIntensity = lampBase.materialEI * s.lamp;
    if (lampBase.glass) lampBase.glass.emissiveIntensity = lampBase.glassEI * s.lamp;
    for (const e of lampBase.lights) e.light.intensity = e.base * s.lamp;

    const u = ship.ocean && ship.ocean.uniforms;
    if (u) {
      for (const [k, v] of Object.entries(s.ocean)) {
        const uu = u[k];
        if (uu && uu.value && uu.value.set) uu.value.set(v[0], v[1], v[2]);
      }
    }

    const timeEl = $('hr-time'), sunEl = $('hr-sun'), outEl = $('hr-mode-out');
    if (timeEl && timeEl.textContent !== s.clock) timeEl.textContent = s.clock;
    if (outEl && outEl.textContent !== s.key) outEl.textContent = s.key;
    if (sunEl) {
      const el = (Math.asin(Math.max(-1, Math.min(1, sunV.y))) * 180 / Math.PI).toFixed(1);
      sunEl.textContent = el.padStart(4, '0') + '\u00b0';
    }
  }

  function bind() {
    ship = window.__ship;
    if (!ship || !ship.scene) return false;

    ship.scene.traverse((o) => {
      const m = o.material;
      if (m && m.uniforms && m.uniforms.uZenith && !skyMats.includes(m)) skyMats.push(m);
    });
    if (!skyMats.length) return false;

    dusk = snapshotSky();

    // Lanterns. Three separate things carry the glow: the lamp material's
    // emissive, the glass panes', and four point lights. The bases are read off
    // the live scene so dusk stays exactly as upstream.
    const M = (ship.ship && ship.ship.materials) || {};
    if (M.lamp) lampBase.material = M.lamp;
    if (M.glass) lampBase.glass = M.glass;
    if (M.lamp) lampBase.materialEI = M.lamp.emissiveIntensity;
    if (M.glass) lampBase.glassEI = M.glass.emissiveIntensity;
    ship.scene.traverse((o) => {
      if (o.isPointLight) lampBase.lights.push({ light: o, base: o.intensity });
    });

    // ---- time of day: initial value from ?t= -------------------------------
    // Continuous, not a preset index: ?t=1.4 is a legal washed-out noon. A
    // missing or unparsable value keeps DEFAULTS, an out-of-range one clamps,
    // and the result is rounded to two decimals to match what writeURL() emits,
    // so reloading a shared link never drifts.
    const MAXT = OVERRIDES.length - 1;
    const tv = parseFloat(new URLSearchParams(location.search).get('t'));
    if (Number.isFinite(tv)) t = target = Math.min(MAXT, Math.max(0, Math.round(tv * 100) / 100));

    const slider = $('hr-mode');
    if (slider) {
      slider.value = String(t);
      paintFill(slider);
      slider.addEventListener('input', () => {
        auto = false;
        const box = $('hr-auto');
        if (box) box.checked = false;
        target = +slider.value; t = target; paintFill(slider); apply();
      });
    }
    const autoBox = $('hr-auto');
    if (autoBox) autoBox.addEventListener('change', () => {
      auto = autoBox.checked;
      if (auto) target = t;
    });

    const sea = $('ow-sea'), swell = $('hr-swell');
    if (sea && swell) {
      const sync = () => { swell.textContent = (+sea.value).toFixed(2) + '\u00d7'; };
      sea.addEventListener('input', sync);
      sync();
    }

    // ---- URL state ---------------------------------------------------------
    // replaceState, not pushState: one drag fires dozens of input events and the
    // back button would then walk through dozens of identical states. The query
    // string is read from the live URL and only our two keys are overwritten,
    // so ?sharecode= and anything else survives.
    let urlTimer = 0;
    const writeURL = () => {
      clearTimeout(urlTimer);
      urlTimer = setTimeout(() => {
        const q = new URLSearchParams(location.search);
        q.set('t', String(Math.round(t * 100) / 100));
        const seaEl = $('ow-sea');
        if (seaEl) q.set('sea', (+seaEl.value).toFixed(2));
        try {
          history.replaceState(null, '', location.pathname + '?' + q.toString() + location.hash);
        } catch (err) { /* file:// blocks replaceState in some browsers */ }
      }, 250);
    };
    slider?.addEventListener('input', writeURL);
    $('ow-sea')?.addEventListener('input', writeURL);

    apply();
    return true;
  }

  let last = performance.now();
  let bound = false;
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (!bound) { bound = bind(); return; }

    if (auto) {
      t += dt * AUTO_SPEED;
      if (t > OVERRIDES.length - 1) t = 0;
      target = t;
      const slider = $('hr-mode');
      if (slider) { slider.value = String(t); paintFill(slider); }
      apply();
    } else if (Math.abs(t - target) > 0.0008) {
      t += (target - t) * (1 - Math.exp(-dt * 5.0));
      apply();
    }
  }

  // ---- small screens: collapse the panel; the status line is the handle.
  function wireDrawer() {
    const panel = document.querySelector('.ow-panel');
    const status = document.getElementById('ow-status');
    if (!panel || !status) return;
    const mq = matchMedia('(max-width: 700px)');
    const sync = () => {
      if (!mq.matches) { delete panel.dataset.collapsed; delete panel.dataset.touched; return; }
      if (!panel.dataset.touched) panel.dataset.collapsed = '1';
    };
    status.addEventListener('click', () => {
      if (!mq.matches) return;
      panel.dataset.touched = '1';
      panel.dataset.collapsed = panel.dataset.collapsed === '1' ? '0' : '1';
    });
    mq.addEventListener('change', () => { delete panel.dataset.touched; sync(); });
    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { wireDrawer(); requestAnimationFrame(tick); });
  } else {
    wireDrawer();
    requestAnimationFrame(tick);
  }
})();
