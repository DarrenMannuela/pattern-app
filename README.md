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
    handlers/         in-memory piece store, CRUD + /api/pack handler
    nesting/          the shelf-packing algorithm itself
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

## API

| Method | Path              | Description                          |
|--------|-------------------|---------------------------------------|
| GET    | `/api/pieces`     | List all pattern pieces               |
| POST   | `/api/pieces`     | Add a piece                           |
| DELETE | `/api/pieces/:id` | Remove a piece                        |
| POST   | `/api/pack`       | Run the nesting algorithm, get layout |

`POST /api/pack` body:

```json
{ "fabricWidth": 150, "seamAllowance": 1 }
```

Returns placed pieces (x/y/w/h/color/grain) plus `totalHeight`
(fabric length used), `efficiency` (%), and `wasteArea`.

## Known limitation — and the natural next step

The nester currently packs each piece's **bounding box**, not its
actual cut shape. That's a fine approximation for planning yardage on
straight-edged pieces, but real pattern pieces have curves (necklines,
armholes, darts) that a rectangle wastes space around. The natural
upgrade is a no-fit-polygon nester (the approach used by tools like
SVGnest) that packs the true silhouette instead of its box — a
meaningfully bigger algorithm, worth tackling once the rest of the
pipeline (pattern drafting from measurements, etc.) is in place.
# pattern-app
