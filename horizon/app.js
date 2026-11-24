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
 *    · two patched lines read `window.__SUN_DIR || Id` -- the key light, and the
 *      glare/rays projection (missing the second one left the bloom anchored to
 *      the sunset azimuth at every time of day)
 *    · two patched lines scale the lamp material and its four point lights by
 *      `window.__LAMP`: the render loop owns their flicker, this file owns the
 *      time-of-day factor. It has to be a multiplier read by the loop, not a
 *      write from here -- the loop runs last, so a direct write never reaches
 *      the lamp and the hood glows at noon
 *    · this file writes that vector, the light's colour/intensity, the sky and
 *      ocean palette uniforms, the window glass, and the readout
 *  No scene code is edited beyond those four lines and the flag removal.
 *
 *  DUSK is not hard-coded: it is snapshotted from the live scene at boot, so the
 *  default state is byte-identical to upstream. The other three presets only
 *  override the keys listed; everything else falls back to the snapshot.
 *
 *  The clock is continuous, not a preset name. Each stop carries a wall-clock
 *  minute (05:47 / 12:31 / 18:52 / 23:14) and the neighbours are interpolated,
 *  so the time walks forward while the slider walks forward. The wrap from night
 *  back to dawn is the one edge that cannot be a straight line -- the cycle is a
 *  closed loop -- so it gets LOOP_SEC to itself: palette, sun and lamps
 *  cross-dissolve from NIGHT to DAWN while the clock runs 23:14 -> 00:00 ->
 *  05:47, the slider stays pinned at the end, and it returns to the start only
 *  once both ends of the picture are already identical.
 * ------------------------------------------------------------------------- */
(() => {
  const DEFAULTS = 2;        // DUSK
  const AUTO_SPEED = 0.05;   // presets per second (~20 s per step)
  const LOOP_SEC = 5;        // night -> dawn dissolve before the cycle restarts
  const MAXT = 3;

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

  // Minutes since midnight -> "HH:MM". Wrap before rounding: 1439.7 would
  // otherwise round to 1440 and print "24:00".
  function clockText(m) {
    const v = ((m % 1440) + 1440) % 1440;
    const r = Math.round(v) % 1440;
    const h = Math.floor(r / 60), mm = r % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  }

  let ship = null;
  let skyMats = [];
  let dusk = null;           // snapshot of the reference palette
  let t = DEFAULTS, target = DEFAULTS, auto = false;
  let sunV = null;
  let loop = null;           // { t0 } while the night -> dawn dissolve runs
  let state = null;          // preallocated mix target: nothing allocates per frame
  const glass = { mat: null, base: 0 };

  const OVERRIDES = [
    {
      key: 'DAWN', min: 5 * 60 + 47, lamp: 0.50,
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
      key: 'NOON', min: 12 * 60 + 31, lamp: 0.00,
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
      key: 'DUSK', min: 18 * 60 + 52, lamp: 1.00,
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
      key: 'NIGHT', min: 23 * 60 + 14, lamp: 1.00,
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

  // ------------------------------------------------------------ state buffers
  // One object, allocated once. The earlier version built a fresh sky object,
  // an ocean object and sixteen little arrays on every frame (twice per frame
  // while the loop dissolved), which is a steady drip of young-gen garbage on a
  // phone and buys nothing: every key is known up front.
  function allocState() {
    const st = {
      sky: {}, ocean: {}, dir: [0, 0, 0], color: [0, 0, 0],
      intensity: 0, lamp: 0, minutes: 0,
    };
    for (const [k, v] of Object.entries(dusk)) st.sky[k] = Array.isArray(v) ? [0, 0, 0] : 0;
    for (const k of Object.keys(OVERRIDES[0].ocean)) st.ocean[k] = [0, 0, 0];
    return st;
  }

  // A -> B in place. `minutes` is passed separately because the night -> dawn
  // leg has to cross midnight (1394 -> 1787 -> mod 1440), which no plain lerp of
  // the two stops can express.
  function mixPair(A, B, u, minutes) {
    const st = state;
    for (const k in st.sky) {
      const a = (A.sky && A.sky[k] !== undefined) ? A.sky[k] : dusk[k];
      const b = (B.sky && B.sky[k] !== undefined) ? B.sky[k] : dusk[k];
      const o = st.sky[k];
      if (Array.isArray(o)) {
        o[0] = a[0] + (b[0] - a[0]) * u;
        o[1] = a[1] + (b[1] - a[1]) * u;
        o[2] = a[2] + (b[2] - a[2]) * u;
      } else {
        st.sky[k] = a + (b - a) * u;
      }
    }
    for (const k in st.ocean) {
      const a = A.ocean[k], b = B.ocean[k], o = st.ocean[k];
      o[0] = a[0] + (b[0] - a[0]) * u;
      o[1] = a[1] + (b[1] - a[1]) * u;
      o[2] = a[2] + (b[2] - a[2]) * u;
    }
    for (let i = 0; i < 3; i++) {
      st.dir[i] = A.sun.dir[i] + (B.sun.dir[i] - A.sun.dir[i]) * u;
      st.color[i] = A.sun.color[i] + (B.sun.color[i] - A.sun.color[i]) * u;
    }
    st.intensity = A.sun.intensity + (B.sun.intensity - A.sun.intensity) * u;
    // Lamps go out with the sunrise, not with the clock. A straight ramp from
    // dawn's 0.50 to noon's 0.00 still had them visibly glowing at 09:00; the
    // falling side is therefore shaped. Only dawn -> noon has a falling side
    // (noon -> dusk -> night rise and hold), so those stops stay exact.
    st.lamp = A.lamp + (B.lamp - A.lamp) * (B.lamp < A.lamp ? 1 - (1 - u) * (1 - u) * (1 - u) : u);
    st.minutes = minutes;
  }

  // Slider position -> palette. Between stops the clock walks linearly between
  // their wall-clock minutes, which is why 09:09 sits halfway from dawn to noon.
  function segmentAt(u) {
    const c = Math.min(Math.max(u, 0), MAXT);
    const i = Math.min(Math.floor(c), MAXT - 1);
    const f = c - i;
    const A = OVERRIDES[i], B = OVERRIDES[i + 1];
    mixPair(A, B, f, A.min + (B.min - A.min) * f);
  }

  function loopAt(w) {
    const A = OVERRIDES[MAXT], B = OVERRIDES[0];
    mixPair(A, B, w, A.min + (B.min + 1440 - A.min) * w);
  }

  // What the panel's output slot says. A single name only when the slider is
  // actually parked on that stop; otherwise both ends, or 15:40 would still
  // read "DUSK".
  function label() {
    if (loop) return OVERRIDES[MAXT].key + ' \u2192 ' + OVERRIDES[0].key;
    const near = Math.round(t);
    if (Math.abs(t - near) < 0.08) return OVERRIDES[near].key;
    const i = Math.min(Math.floor(t), MAXT - 1);
    return OVERRIDES[i].key + ' \u2192 ' + OVERRIDES[i + 1].key;
  }

  function apply() {
    if (!ship || !dusk || !state) return;
    const s = state;

    const L = Math.hypot(s.dir[0], s.dir[1], s.dir[2]) || 1;
    if (!sunV) sunV = { x: 0, y: 0, z: 0 };
    sunV.x = s.dir[0] / L; sunV.y = s.dir[1] / L; sunV.z = s.dir[2] / L;
    window.__SUN_DIR = sunV;
    // Read by the render loop every frame, after this one: a multiplier is the
    // only ownership split that survives that ordering.
    window.__LAMP = s.lamp;

    const light = ship.sun;
    if (light) {
      if (light.color) light.color.setRGB(s.color[0], s.color[1], s.color[2]);
      light.intensity = s.intensity;
    }

    for (const mat of skyMats) {
      const U = mat.uniforms;
      for (const k in s.sky) {
        const u = U[k];
        if (!u) continue;
        const v = s.sky[k];
        if (typeof v === 'number') u.value = v;
        else if (u.value && u.value.set) u.value.set(v[0], v[1], v[2]);
      }
      if (U.uSunDir && U.uSunDir.value && U.uSunDir.value.set) {
        U.uSunDir.value.set(sunV.x, sunV.y, sunV.z);
      }
    }

    if (glass.mat) glass.mat.emissiveIntensity = glass.base * s.lamp;

    const u = ship.ocean && ship.ocean.uniforms;
    if (u) {
      for (const k in s.ocean) {
        const uu = u[k];
        if (uu && uu.value && uu.value.set) {
          const v = s.ocean[k];
          uu.value.set(v[0], v[1], v[2]);
        }
      }
    }

    const timeEl = $('hr-time'), sunEl = $('hr-sun'), outEl = $('hr-mode-out');
    const clock = clockText(s.minutes);
    if (timeEl && timeEl.textContent !== clock) timeEl.textContent = clock;
    const lab = label();
    if (outEl && outEl.textContent !== lab) outEl.textContent = lab;
    if (sunEl) {
      const el = (Math.asin(Math.max(-1, Math.min(1, sunV.y))) * 180 / Math.PI).toFixed(1);
      sunEl.textContent = el.padStart(4, '0') + '\u00b0';
    }
  }

  function paintSlider(v) {
    const slider = $('hr-mode');
    if (!slider) return;
    const s = String(v);
    if (slider.value !== s) slider.value = s;
    paintFill(slider);
  }

  // Auto cycles can be paused by reduced-motion, in which case the render loop
  // holds the last frame. A running clock over a frozen picture is not a still,
  // it is a lie: nudge the loop whenever the palette actually moves.
  function wake() {
    const od = window.__OD;
    if (od && od.frozen) od.touch();
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
    state = allocState();

    // Only the window glass is ours: the render loop does not touch it, so this
    // is the one lamp channel a per-frame write from here can win.
    const M = (ship.ship && ship.ship.materials) || {};
    if (M.glass) { glass.mat = M.glass; glass.base = M.glass.emissiveIntensity; }

    // ---- time of day: initial value from ?t= -------------------------------
    // Continuous, not a preset index: ?t=1.4 is a legal washed-out noon. A
    // missing or unparsable value keeps DEFAULTS, an out-of-range one clamps,
    // and the result is rounded to two decimals to match what writeURL() emits,
    // so reloading a shared link never drifts.
    const tv = parseFloat(new URLSearchParams(location.search).get('t'));
    if (Number.isFinite(tv)) t = target = Math.min(MAXT, Math.max(0, Math.round(tv * 100) / 100));

    const slider = $('hr-mode');
    if (slider) {
      slider.value = String(t);
      paintFill(slider);
      slider.addEventListener('input', () => {
        loop = null;
        auto = false;
        const box = $('hr-auto');
        if (box) box.checked = false;
        target = +slider.value; t = target; paintFill(slider);
        segmentAt(t); apply();
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

    segmentAt(t);
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

    // ---- night -> dawn: the one edge that is not a straight line -----------
    if (loop) {
      const raw = Math.min(1, Math.max(0, (now - loop.t0) / (LOOP_SEC * 1000)));
      const w = raw * raw * (3 - 2 * raw);   // smoothstep: no velocity step at either end
      loopAt(w);
      apply();
      paintSlider(MAXT);
      wake();
      if (raw >= 1) {
        loop = null;
        t = target = 0;
        paintSlider(0);
        segmentAt(0);
        apply();
      }
      return;
    }

    if (auto) {
      t += dt * AUTO_SPEED;
      if (t >= MAXT) {
        t = target = MAXT;
        loop = { t0: now };
        loopAt(0);
        apply();
        paintSlider(MAXT);
        return;
      }
      target = t;
      paintSlider(t);
      segmentAt(t);
      apply();
      wake();
    } else if (Math.abs(t - target) > 0.0008) {
      t += (target - t) * (1 - Math.exp(-dt * 5.0));
      segmentAt(t);
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
