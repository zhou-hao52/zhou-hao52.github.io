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
- **Modification** (the entire integration surface):
  1. one line in the render loop changed from
     `addScaledVector(Id,150)` to `addScaledVector(window.__SUN_DIR||Id,150)`,
     so the sun direction can be driven from outside;
  2. the upstream intro block (`Ultra-Realistic Water` plus two paragraphs of
     technique description) replaced with this project's own readout;
  3. the two comparison toggles — **Footprint fade** and **Normals** — removed
     from the panel together with the two warnings they produced. Both drove
     uniforms (`uFootprint`, `uPixelNormals`) that already default to 1, so the
     picture is unchanged; the panel controller had no null guards, so it was
     rewritten in the same edit rather than deleted around;
  4. a "Time of day" control and an "Auto cycle" switch added to the panel, and
     the panel's status line reworded from an upstream technique note to a
     functional label (`Controls · sea state, light and camera`);
  5. the page title, meta description and favicon replaced (upstream's were
     `Ultra-Realistic Water — Three.js · WebGL2 · GLSL`, a Gerstner technique
     write-up, and its own sun-over-wave mark);
  6. `app.js` appended.
- **Not modified**: any shader, any geometry, the camera rig, the ocean module,
  the post chain, or the remaining panel controls.

## This project's own work

- **`app.js`** — the time-of-day system. Presets for dawn / noon / dusk / night
  covering the sun direction, light colour and intensity, the sky shader's
  thirteen palette uniforms (`uZenith`, `uMid`, `uLowSun`, `uLowAnti`,
  `uHorSun`, `uHorAnti`, `uSunGlow`, `uSunDisc`, `uCloudLit`, `uCloudGold`,
  `uCloudDark`, `uStarAmt`) and the ocean's `uSunColor` / `uAmbient` / `uDeep` /
  `uSSS`; linear interpolation between presets, a manual slider, an auto cycle,
  and a live instrument readout. It also drives the lanterns — the lamp and
  window-glass `emissiveIntensity` plus four point lights — so the ship's lights
  fade out at midday and come back at dusk instead of glowing at noon. **Dusk is snapshotted from the live scene at
  boot rather than hard-coded**, so the default state is identical to upstream.
- the readout block at the top-left and its styling
- the panel rewrite — guards on every lookup, the four-stop time axis (a
  continuous fill for position, four labels for the nearest preset), the
  keyboard step-through, and a fix for an upstream bug where writing the status
  line's `textContent` destroyed the inner `<span>` that the phone drawer's
  ellipsis depends on
- the first-paint gate: a `LOADING` line that hands over when the compositor has
  already faded the picture in, with separate messages for a missing WebGL2
  context and a shader-compilation failure
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
