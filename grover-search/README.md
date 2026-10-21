# Grover search article

`index.html` is the standalone article, linked from the homepage, blog listing,
and interactive demos listing. No build step is required to serve the article.
Equations and inline mathematics use TeX delimiters in the HTML, rendered by
`math.js` with KaTeX 0.19.0. The distribution, fonts, license, and provenance
are pinned in `vendor/katex-0.19.0/`; math makes no CDN requests. KaTeX emits
HTML plus accessible MathML. The shared site font and optional comment widget
retain the site's existing services.

Serve the site root over HTTP, for example:

```powershell
python -m http.server 5593 --bind 127.0.0.1
```

Open `http://127.0.0.1:5593/grover-search/`. ES modules and the shader fetches
require a server; opening the HTML with a `file:` URL is insufficient.

## Content and conventions

- The opening problem and reflections use general N. An explicit transition
  introduces the 4×4 worked example, input 0000, marked state 1111.
- The opening vector widget (`reflections.js`, `reflection-core.js`) uses the
  conventional D = 2|s><s| − I in the normalized (unmarked sum, marked) basis.
  It starts already prepared and steps through the oracle and full diffuser.
  The arrow sweep is explicitly a geometric illustration between exact gate
  endpoints, not a physical gate evolution. Readouts show completed endpoints.
- Preparation and the three mixer gates are introduced afterward. The column
  and wave simulations retain M = H S_i H = −D; no phase compensation is added.
  The article derives the minus from flipping only the input component and
  relates both conventions by (−1)^k at complete-round boundaries.
- The construction widget (`construction.js`, `construction-core.js`) is a
  simple real-vector illustration of the change-of-basis sandwich R S_i R^T.
  It turns the reference onto the initial axis, reflects, then turns back.
  The mirror is explicitly perpendicular to the reference; the original vector,
  reflection chord, and midpoint make the final symmetry visible. Smooth arcs
  illustrate the geometry between operations, rather than a quantum gate pulse.
  R is labelled as a rotation: its intermediate vectors differ from H, while
  the complete signed reflection is exactly R S_i R^T = H S_i H = −D.
  Playback can be paused, scrubbed, or reversed. The example angle is adjustable.
- The article separates logical-mode probabilities from spatial cell integrals.
- The four-model comparison summarizes states, preparation, and current rules.
- Free evolution supplies the spatial mixer; ideal mode-projector phase pulses
  are still assumed. The spin version adds a specified spin-only drive.
- The compact column viewer imports the ordinary core and renderer unchanged.
  It fixes the example at 4×4; the full apps retain all grid/state controls.
- The full-demo picker creates one iframe at a time, on demand. Switching apps
  starts a fresh simulation. The compact viewer suspends its animation while
  offscreen. Comments load only near the end of the article.

## Independent demo snapshots

`demos/sources.json` records the source branch, full local commit ID, and SHA-256
of every copied file. Copies include their source license and keep their original
asset-version suffixes. Source files have not been adapted to article layout or
mixed across branches. The source repository is not modified.

| Folder | Source branch | Pinned revision |
| --- | --- | --- |
| ordinary | Ordinary-Grover | 425109c |
| wave-hadamard | MultiRegion | 6e209e6 |
| free-box | MultiRegionFreeMixing | 2f2991a |
| spin | SPINMultiRegionFree | f03b4f0 |

To deliberately refresh them, update the pinned revisions in the script, then:

```powershell
python grover-search/tools/snapshot-demos.py ../BohmianGrover2D
node grover-search/tools/build-figures.mjs
```

The SVG generator evaluates the branch cores directly. Wave hues follow the
wave demos' red-at-zero, cyan-at-pi convention. Brightness
is a monotone density scale, shared across panels in each wave figure. The spin
total panel instead colors z polarization. `images/checkpoints.json` records the
numerical values used in the post. `hero.png` is a 1200×540 browser rasterization
of `hero.svg` for social metadata; regenerate that export after changing the hero.
Each figure also has a `-mobile.svg` portrait composition, generated from the
same states and brightness scales. HTML `picture` sources select it at widths
up to 600px; full-size figure links remain available. The comparison becomes
four stacked model rows on small screens. Figure generation and checks use
Node.js 22 or newer with ES module syntax detection.

## Verification

```powershell
node --test grover-search/tests/article.test.mjs
node --check grover-search/article.js
node --check grover-search/math.js
node --check grover-search/reflections.js
node --check grover-search/construction.js
python grover-search/tools/check-links.py
git -c core.safecrlf=false diff --check
```

The numerical tests independently check the continuum phase matrix, positive-time
inverse, analytic amplification curves, displayed signs, spin count, and moving
mean. They compare the two-dimensional widget against the full 16-state search
and its analytic rotation, including the global sign and overshoot. They also
check the real rotation sandwich and its visible mirror geometry against
the full signed Hadamard mixer for multiple input vectors. They
compare all 131 bundled files against their source hashes. This byte-level
snapshot check requires LF checkout endings; Windows CRLF conversion can cause
hash mismatches without a content change.

Open `/grover-search/tests/browser-check.html` on the same server for the browser
fixture. It exercises vector reflection endpoints, drawn arrow coordinates,
the three geometric stages, their carried reference and mirror, the selective
component flip, the final reflection symmetry, and input-angle/reset controls, alongside
previous/reset/cancellation/overshoot, and the production compact column viewer, previous/combine/pause,
overshoot, measurement indication, figure loading, every full demo's preparation,
and desktop/390px layout. It also checks KaTeX, MathML, portrait figure sources,
the model comparison, and 320px layout with all technical details expanded.
Canvas readbacks verify the mean guide is drawn and
responds to the toggle and probability view. The vector diagram supports keyboard
buttons, live descriptions, and reduced motion. The construction view uses a
continuous real geometric sweep with pause, scrub, and reverse controls. The original branch
test suites remain in the source repository; they are not duplicated here.

The article publishes through the homepage repository's GitHub Pages deployment.
Its original publication date is 15 October 2026.
