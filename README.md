# Marker Layout

A pattern-cutting layout tool: add your pattern pieces (width, height,
quantity, whether the grain line locks their orientation), set your
fabric width and seam allowance, and generate an efficient cutting
layout that minimizes wasted fabric.

Go backend + React (Vite) frontend, talking over a small JSON API.

## Project structure

```
pattern-app/
  backend/            Go API server (stdlib net/http only, no external deps)
    main.go           routes + CORS
    handlers/         in-memory piece store, CRUD + pack/draft/grade handlers
    draft/            parametric bodice drafting — adult (dart-based) and
                       child (dartless) blocks, measurements -> curved SVG paths
    grading/          size-run generation: one base size/age's measurements
                       graded across a full run via fixed per-step increments
    nesting/          irregular-shape nester: SVG path parsing, polygon
                      rasterization, and grid-based bottom-left packing
  frontend/           React app (Vite)
    src/
      api.js          fetch client for the backend
      App.jsx
      components/
        DraftView.jsx        adult bodice drafting + dart position
        GradingView.jsx      adult size run (S-XXXL) + order quantities
        ChildGradingView.jsx kids' age run (6-12) + order quantities
        Sidebar.jsx          fabric settings, add-piece form, piece list
        Canvas.jsx           SVG render of the fabric layout
        StatBar.jsx          efficiency / waste / length stats
```

## Running it

You need Go 1.22+ and Node 18+.

**Backend** (from `backend/`):

```bash
go run .
```

Starts the API on `http://localhost:8080`. It seeds a few example
pattern pieces (bodice front/back, sleeve) so there's something to
look at immediately.

**Frontend** (from `frontend/`, in a second terminal):

```bash
npm install
npm run dev
```

Starts the Vite dev server (prints its own URL, typically
`http://localhost:5173`). Open that in a browser.

If you run the backend on a different host/port, point the frontend
at it with an env var before `npm run dev`:

```bash
VITE_API_URL=http://localhost:9000 npm run dev
```

## Four tabs

- **Draft Pieces** — enter body measurements (or leave them blank for
  a default size), pick where the front bust dart should sit (waist,
  side seam, French, shoulder, armhole, or neckline), and generate a
  bodice front + back with real curved outlines. Dart rotation is
  genuine geometry: the dart's wedge angle is derived once from the
  bust/waist difference and conserved as it moves — see
  `backend/draft/draft.go` for the rotation math (`dartLegsAt`,
  `splitCubic`). Each piece can be sent straight to the cutting layout.
- **Size Grading** — draft one adult base size, generate the full
  S-XXXL run from it via fixed per-size increments (`backend/grading`),
  enter an order quantity per size, and send some or all of them to
  the cutting layout at once — sizes sent together nest into one
  shared marker, which is how a real mixed-size order actually gets cut.
- **Kids' Sizing** — the same idea, but genuinely different underneath:
  children don't have the bust curve a dart exists to shape for, so
  this drafts a separate dartless block (`draft.DraftChildBodice`,
  A-line hem flare instead of a waist taper) and grades it across ages
  6-12 with its own per-age-year increments, not the adult per-size ones.
- **Cutting Layout** — the irregular nester: add pieces (by hand, or
  sent from any of the three tabs above), set fabric width and seam
  allowance, and generate a layout using each piece's real outline for
  collision detection.

## API

| Method | Path                | Description                                     |
|--------|---------------------|---------------------------------------------------|
| GET    | `/api/pieces`       | List all pattern pieces                         |
| POST   | `/api/pieces`       | Add a piece                                     |
| DELETE | `/api/pieces/:id`   | Remove a piece                                  |
| POST   | `/api/pack`         | Run the nesting algorithm, get layout           |
| POST   | `/api/draft`        | Draft an adult bodice front/back                |
| POST   | `/api/grade`        | Draft + grade an adult size run (S-XXXL)        |
| POST   | `/api/grade-child`  | Draft + grade a dartless kids' age run (6-12)   |

`POST /api/pack` body:

```json
{ "fabricWidth": 150, "seamAllowance": 1, "resolution": 1.0 }
```

`resolution` (cm per grid cell, optional, default 1.0) trades
packing tightness for speed.

Returns placed pieces — each with its real `pathData`, an
`origWidth`/`origHeight`, and a `tx`/`ty`/`rotation` to position it —
plus `totalHeight` (fabric length used), `efficiency` (%), `wasteArea`,
and `unplaced` (names of any piece that didn't fit at all).

`POST /api/draft` body (any field can be omitted — defaults fill in):

```json
{
  "bust": 90, "waist": 72, "backWaistLength": 40,
  "shoulder": 12.5, "neck": 36, "ease": 6,
  "dartPosition": "waist"
}
```

`dartPosition` is one of `waist` (default), `side`, `french`,
`shoulder`, `armhole`, `neckline`. Returns `[front, back]`, each with
a `pathData` SVG path string, a bounding `width`/`height`, and
`notes` on the simplifications made.

`POST /api/grade` body — same fields as `/api/draft` plus `baseSize`
(default `"M"`) and `sizes` (default all six):

```json
{ "bust": 92, "waist": 74, "baseSize": "M", "sizes": ["S","M","L","XL"] }
```

Grade rule: bust/waist ±4cm, shoulder/neck ±1cm, torso length ±1.5cm
per size step (`grading.DefaultAdultGradeRule`) — a standard
ready-to-wear increment, not a fitted grade for any specific chart.

`POST /api/grade-child` body — same shape, but `baseSize`/`sizes` are
ages as strings (default base `"8"`, default sizes `6`-`12`), and
there's no `dartPosition` (the child block is always dartless):

```json
{ "bust": 60, "backWaistLength": 29, "baseSize": "8", "sizes": ["8","10"] }
```

Grade rule: chest +2cm, waist +1.5cm, shoulder +0.4cm, neck +0.5cm,
length +1.3cm per age-year (`grading.DefaultChildGradeRule`).

Both grade endpoints return an array of
`{ size, measurements, pieces }` rows, smallest to largest.

## Known limitations — and the natural next steps

- **Grading is a fixed linear increment per step**, for both adults
  and kids. Real growth (especially children's, around growth spurts)
  and real ready-to-wear grading (which sometimes varies increment
  size across the range, not just applying one flat delta throughout)
  aren't perfectly linear. Treat a generated run as a strong starting
  point — spot-check the smallest and largest sizes against a real fit
  or your supplier's chart before cutting a full production order.
- **Only a bodice is drafted** for both adults and kids — no sleeve,
  collar, placket, trouser, or apron blocks yet. For an actual uniform
  business this is the next most valuable gap to close, since a bodice
  sloper alone isn't a wearable garment.
- **No persistent pattern library.** The piece store is in-memory and
  resets on every backend restart — there's no way yet to save a style
  (e.g. "Restaurant X polo") and reload or clone it later instead of
  redrafting from scratch.
- **Dart rotation covers the adult front bust dart only**, across six
  preset positions. No slash-and-spread (adding fullness/flare) or
  converting a dart into gathers yet.
- **Nesting uses each piece's real curved outline** (a grid/raster
  collision check, not a true no-fit-polygon/Minkowski-sum algorithm).
  It correctly avoids overlaps between concave shapes and finds
  90°/180° rotations that fit, but it isn't as tight as a proper NFP
  nester — there's visible gap between pieces where a curve could in
  principle tuck closer into its neighbor's curve.
- **The draft formulas are simplified approximations**, the kind
  taught as quick "sloper" shortcuts (e.g. armhole depth ≈ bust/4 +
  2.5cm) — not a professionally fitted block. Real patternmaking
  refines this with a muslin/toile fitting. Treat the output as a
  solid starting shape.
