# Third-party notices

This project is a **derived work**: it takes an MIT-licensed three.js scene as its
rendering base and builds a time-of-day system and its own interface on top. That
is stated plainly here because the licence requires attribution, and because a
report about this project has to be honest about which parts are whose.

---

## Upstream work

**`MengTo/Skills` → `agent-skills/3d/3d-ultra-realistic-water`**

- **Licence**: MIT
- **What it contains**: a demo page (`demo/index.html`) built from a reference
  scene — three.js r169 inlined, a three-masted ship under sail, sky with
  volumetric clouds, islands, gulls, spray, camera rig, and an octave of
  post-processing — plus `assets/ocean.mjs`, the ocean surface module.
- **What this project takes from it**:
  - `index.html` — the whole rendering base: scene, ship, sky, clouds, gulls,
    spray, camera rig, post-processing, and `ocean.mjs` inlined.
  - the bottom-left control panel's markup, styling and wiring.
- **Modification** (the entire integration surface, eight points):
  1. two lines in the render loop now read `window.__SUN_DIR || Id` instead of
     the constant `Id`: the key light (`addScaledVector(…, 150)`) and the
     screen-space position of the sun that feeds the glare/rays pass
     (`addScaledVector(…, 5e3)`). The first lets the sun be driven from outside;
     without the second the bloom stayed anchored to the sunset azimuth at every
     time of day, so noon had a glare spot where the sun no longer was;
  2. two lines in the render loop multiply the lantern by `window.__LAMP`: the
     lamp material's `emissiveIntensity` and its four point lights. The loop
     already owned their flicker and runs after `app.js`, so the time-of-day
     factor can only arrive as a multiplier — a direct write from `app.js` was
     overwritten every frame and the hood glowed at noon (measured 8.5 of 9);
  3. the main-mast flag is no longer built: its `Ed({… map: s.flag …})` mesh
     statement is deleted and the matching `t.flag = dS()` dropped, because a
     pirate skull is the wrong mark on a page about light. The fore and mizzen
     pennants are untouched, and `dS()` itself is left in place, unused;
  4. the adaptive pixel budget in the render loop was rewritten: frames longer
     than 0.4 s (a window switch, a closed lid) are dropped from the average and
     restart the window, the threshold is relative to the measured refresh floor
     rather than a hard 26 ms, and the scale now only ratchets down, resetting
     on a viewport resize. Upstream read a resume gap as load, dropped to 0.75
     and climbed back in five 0.06 steps — five reallocations of the post chain,
     which is the burst of flicker seen when returning to the window. The
     recovery test (`< 14.5 ms`) could never fire on a 60 Hz panel, so the drop
     was also permanent there;
  5. the upstream intro block (`Ultra-Realistic Water` plus two paragraphs of
     technique description) replaced with this project's own readout;
  6. the two comparison toggles — **Footprint fade** and **Normals** — removed
     from the panel together with the two warnings they produced. Both drove
     uniforms (`uFootprint`, `uPixelNormals`) that already default to 1, so the
     picture is unchanged; the panel controller had no null guards, so it was
     rewritten in the same edit rather than deleted around;
  7. a "Time of day" control and an "Auto cycle" switch added to the panel, and
     the panel's status line reworded from an upstream technique note to a
     functional label (`Controls · sea state, light and camera`);
  8. the page title, meta description and favicon replaced (upstream's were
     `Ultra-Realistic Water — Three.js · WebGL2 · GLSL`, a Gerstner technique
     write-up, and its own sun-over-wave mark); `app.js` appended.
- **Not modified**: any shader, any geometry beyond the removed flag, the camera
  rig, the ocean module, the post chain, or the remaining panel controls.

## This project's own work

- **`app.js`** — the time-of-day system. Presets for dawn / noon / dusk / night
  covering the sun direction, light colour and intensity, the sky shader's
  thirteen palette uniforms (`uZenith`, `uMid`, `uLowSun`, `uLowAnti`,
  `uHorSun`, `uHorAnti`, `uSunGlow`, `uSunDisc`, `uCloudLit`, `uCloudGold`,
  `uCloudDark`, `uStarAmt`) and the ocean's `uSunColor` / `uAmbient` / `uDeep` /
  `uSSS`; linear interpolation between presets, a manual slider, an auto cycle,
  and a live instrument readout. **Dusk is snapshotted from the live scene at
  boot rather than hard-coded**, so the default state is identical to upstream.
- **The clock is continuous, not a preset name.** Each stop carries a wall-clock
  minute (05:47 / 12:31 / 18:52 / 23:14); the two neighbours are interpolated,
  so 15:42 is 50 % of the way from noon to dusk and the readout walks forward
  while the slider does. The panel's output shows one name only when parked on a
  stop, otherwise `NOON → DUSK`.
- **The wrap from night back to dawn is the one edge a line cannot express**, so
  it gets its own five seconds: palette, sun, sea and lamps cross-dissolve from
  NIGHT to DAWN in parameter space (not two renders composited), the clock runs
  23:14 → 00:00 → 05:47 without ever moving backwards, and the slider stays
  pinned at the end until both ends of the picture are identical, then returns
  to the start. Dragging the slider or clicking a stop cancels it; switching the
  cycle off does not, because there is no single slider position to fall back to.
- **Lamps are owned by two systems, split by channel**: the render loop multiplies
  the hood and the four point lights by `window.__LAMP`; `app.js` drives the
  window glass (nothing else writes it) and supplies that factor. The falling
  side (dawn 0.50 → noon 0.00) is eased so they are out by mid-morning instead of
  still glowing at 09:00.
- the readout block at the top-left and its styling
- the panel rewrite — guards on every lookup, the four-stop time axis (a
  continuous fill for position, four labels for the nearest preset), the
  keyboard step-through, and a fix for an upstream bug where writing the status
  line's `textContent` destroyed the inner `<span>` that the phone drawer's
  ellipsis depends on. Pressing the slider also ends the auto cycle, otherwise
  the thumb crawled out from under a still finger.
- the first-paint gate: a `LOADING` line that hands over when the compositor has
  already faded the picture in, with separate messages for a missing WebGL2
  context and a shader-compilation failure
- the reduced-motion still: `prefers-reduced-motion` freezes the loop once the
  boot fade has actually finished (the earlier test, "3.2 s after this script
  parsed", always passed before the first frame and left a 3 %-brightness page)
- shareable URL state — `?t=` and `?sea=` written with `replaceState`, other
  query parameters left untouched
- `tools/` — the extraction and screenshot tooling used during development
- `docs/` — the reference frame measurements used to set the composition

## three.js

- **Licence**: MIT — inlined inside `index.html` by the upstream bundle (r169).

---

## Not used

Earlier iterations of this project contained a from-scratch scene (own sky
model, beach height field, procedural ship, bird silhouettes) and a quantised
ship geometry extracted from the same upstream demo. Both are kept under
`legacy/` for reference only and are **not** part of the shipped site.
