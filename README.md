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
    handlers/         in-memory piece store, CRUD + /api/pack + /api/draft handlers
    draft/            parametric bodice drafting (measurements -> curved SVG paths)
    nesting/          irregular-shape nester: SVG path parsing, polygon
                      rasterization, and grid-based bottom-left packing
  frontend/           React app (Vite)
    src/
      api.js          fetch client for the backend
      App.jsx
      components/
        Sidebar.jsx   fabric settings, add-piece form, piece list
        Canvas.jsx    SVG render of the fabric layout
        StatBar.jsx   efficiency / waste / length stats
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

## Two tabs

- **Draft Pieces** — enter body measurements (or leave them blank for
  a default size) and generate a bodice front + back as real curved
  outlines (neckline, shoulder, armhole, side seam, waist dart), using
  classic proportional pattern-drafting formulas. Each piece can be
  sent straight to the cutting layout.
- **Cutting Layout** — the Phase 1 nester: add pieces (by hand, or via
  "Send to cutting layout" from the Draft tab), set fabric width and
  seam allowance, and generate the most efficient rectangular layout.

## API

| Method | Path              | Description                                |
|--------|-------------------|---------------------------------------------|
| GET    | `/api/pieces`     | List all pattern pieces                     |
| POST   | `/api/pieces`     | Add a piece                                 |
| DELETE | `/api/pieces/:id` | Remove a piece                              |
| POST   | `/api/pack`       | Run the nesting algorithm, get layout       |
| POST   | `/api/draft`      | Draft a bodice front/back from measurements |

`POST /api/pack` body:

```json
{ "fabricWidth": 150, "seamAllowance": 1 }
```

Returns placed pieces (x/y/w/h/color/grain) plus `totalHeight`
(fabric length used), `efficiency` (%), and `wasteArea`.

`POST /api/draft` body (any field can be omitted — defaults fill in):

```json
{ "bust": 90, "waist": 72, "backWaistLength": 40, "shoulder": 12.5, "neck": 36, "ease": 6 }
```

Returns `[front, back]`, each with a `pathData` SVG path string, a
bounding `width`/`height`, and `notes` on the simplifications made.

## Known limitations — and the natural next steps

- **Nesting now uses each piece's real curved outline** (a grid/raster
  collision check, not a true no-fit-polygon/Minkowski-sum algorithm).
  It correctly avoids overlaps between concave shapes and finds
  90°/180° rotations that fit, but it isn't as tight as a proper NFP
  nester — there's visible gap between pieces where a curve could in
  principle tuck closer into its neighbor's curve. `resolution`
  (grid cm/cell, default 1.0) trades packing tightness for speed if
  you want to tune it via the `/api/pack` request body.
- **The draft formulas are simplified approximations**, the kind
  taught as quick "sloper" shortcuts (e.g. armhole depth ≈ bust/4 +
  2.5cm) — not a professionally fitted block. Real patternmaking
  refines this with a muslin/toile fitting. Treat the output as a
  solid starting shape.
- **Only a basic bodice is drafted.** Sleeves, skirts, and other
  garment types would each need their own drafting formulas in
  `backend/draft/`.
