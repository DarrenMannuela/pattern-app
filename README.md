# Konveksi Studio

A tool for a garment maker (konveksi) that makes uniforms and merchandise.
You pick a customer's garment from picture tiles, and it drafts the real
cutting pieces, draws a front/back/sleeve 2D diagram from those pieces, and
lays the pieces out on fabric to cut.

Go backend + React (Vite) frontend, talking over a small JSON API.

## What it does

- **Orders.** One order per customer: garment type, size chart, fabric,
  notes, and saved revisions ("mockups") of the design. Reopening an order
  restores the last revision, its colours and its reference photo.
- **Garments.** School shirt, polo, PE shirt, uniform shirt (collar or no
  collar), pants, shorts, A-line skirt, merchandise (tote/drawstring bags,
  pouch, apron, bucket hat, headband, patch, lanyard, banner) and a custom
  design you trace or draw yourself.
- **Pattern maker.** Parts are picture tiles (fit, sleeves, collar, front,
  back, hem, trim, motif bands; for trousers waist, leg, pockets, belt loops,
  fly, side stripe). Click or drag a tile and the pieces are redrafted and the
  2D drawing redrawn a moment later. The drawing is generated from the drafted
  pieces, so pattern, cut list and picture agree.
- **Extras on any part of the garment.** Click the drawing to add a pocket,
  pen pocket, embroidery or sablon (screen print) exactly there: on the collar,
  cuffs, chest, sleeves, back, legs, waistband or hem. Drag, resize, rotate
  (a sleeve pocket follows the arm), copy to the other side. Sleeves also have
  left and right side views.
- **Motif bands.** A collar-to-hem streak, two streaks, chest band, shoulder
  band, hem band, arm bands or an insert side panel, in a solid colour or a
  pattern (stripes, batik, parang, chevron, dots, check). Each band adds its own
  strip to the cut list: a motif is a different cut of fabric.
- **Cutting layout.** Send an order's pieces (all sizes, with quantities) to the
  Cutting Layout tab, which nests them on the fabric width using their real
  outlines.
- **Reference photo.** Put a photo of an existing uniform beside the drawing,
  pick its fabric and trim colours by clicking it, and match the parts by eye.
  No key or service needed. Optionally, have the app read the photo for you
  (see [Photo reading](#photo-reading-optional)).

## Project structure

```
pattern-app/
  backend/            Go API server
    main.go           routes + CORS
    orders/           orders, revisions, and drafting the pieces per garment
    draft/            drafting: shirt/polo (collars, sleeves, plackets, V-neck,
                      trim, motif bands), trousers/shorts, skirt, child block,
                      merchandise, custom designs, extras (pockets etc.),
                      seam allowance + grainline (finish.go)
    vision/           reads a photo into the maker's terms: Claude API or a
                      local Ollama vision model
    handlers/         HTTP handlers
    nesting/          irregular-shape nester (SVG paths -> polygons -> packing)
    grading/          size-run grading (used by the older draft/grade endpoints)
    catalog/          fabric list
  frontend/           React app (Vite)
    src/
      App.jsx, api.js
      components/
        OrdersView, OrderDetailView   the order list and one order
        PatternMaker                  tiles, extras drawer, views, photo panel
        GarmentFlatPreview            the 2D drawing and its click-to-add popover
        PartThumbs, MotifDefs         tile pictures and motif pattern fills
        ReferencePhoto                photo beside the drawing, colour picking
        CustomDesigner                trace or draw your own design
        LayoutView, Canvas, Sidebar   the cutting layout tab
      lib/
        garmentFlat.js                turns drafted pieces into the 2D drawing
        torsoGeometry, collarGeometry, sleeveWrap, merchFlat, ...
        photoMatch.js, photoColors.js photo reading -> maker choices, colours
```

## Running it

You need Go 1.24+ and Node 18+.

**Backend** (from `backend/`):

```bash
go run .
```

Starts the API on `http://localhost:8080` (set `PORT` to change it).

**Frontend** (from `frontend/`, in a second terminal):

```bash
npm install
npm run dev
```

Starts the Vite dev server and prints its URL (`http://localhost:5173` by
default; add `-- --port 5175` for another port). An order opens by link, for
example `http://localhost:5175/#order-12`.

If the backend is elsewhere, point the frontend at it:

```bash
VITE_API_URL=http://localhost:9000 npm run dev
```

## Checks

```bash
cd backend  && gofmt -l . && go vet ./... && go test ./...
cd frontend && npm run lint && npm test
```

`npm run lint` does not catch undefined identifiers or missing imports, so after
changing imports or shared libraries, open each garment type in the browser too.

`npm test` runs the 2D-preview geometry tests (`frontend/src/lib/__tests__/`) —
`torsoGeometry`, `collarGeometry`, `sleeveWrap` and `pocketShapes` — against real
pieces captured from the backend (`__tests__/fixtures.js`), not hand-written
stand-ins, so they exercise the shapes the app actually drafts. If a drafting
formula changes shape enough to break these, regenerate the fixtures by hitting
`/api/orders/{id}/preview` on a temp order (collar/convertible/full sleeve;
v_neck/contrast trim/three_quarter sleeve; polo collar) and re-saving the pieces
keyed by name.

## Photo reading (optional)

The reference photo panel always works by eye. To have the app read the parts off
a photo, it uses whichever of these is available, in this order:

1. **Claude API**, if `ANTHROPIC_API_KEY` is set. Each photo is one request to the
   API. It should read fine details better than a small local model, but it has
   only been tested against a stand-in server so far, not against real photos.
2. **A local vision model under [Ollama](https://ollama.com)**, which needs no key
   and keeps the photo on your machine. Run `ollama pull qwen3-vl:4b` (about 3 GB;
   it fits in 8 GB of memory). The app finds the best vision model you have
   installed.

| Variable              | Meaning                                                    |
|-----------------------|------------------------------------------------------------|
| `ANTHROPIC_API_KEY`   | Use the Claude API for photo reading                       |
| `VISION_PROVIDER`     | `anthropic` or `ollama` to force one                       |
| `OLLAMA_HOST`         | Ollama address (default `http://localhost:11434`)          |
| `OLLAMA_VISION_MODEL` | Use this local model instead of picking one                |
| `PORT`                | Backend port (default 8080)                                |
| `VITE_API_URL`        | Backend address for the frontend                           |

How well does the local model do? In a small test on 12 photos (shirts, polos,
chef coats, trousers, shorts, a skirt, and two of our own uniforms) it got about 9
in 10 of the parts right after the prompt was tuned: garment type, sleeves,
neckline, elastic waist and side stripes were strong. It still confuses a band
collar with a point collar and a hidden placket with a visible one, and it takes
1.5 to 3 minutes a photo on a small laptop. Its guesses at pockets, prints and
motif bands are only shown as suggestions, because it invents them. Treat any
automatic match as a first draft and check each part.

## API

| Method | Path                                | Description                                   |
|--------|-------------------------------------|-----------------------------------------------|
| GET/POST | `/api/orders`                     | List / create orders                          |
| GET/PUT/DELETE | `/api/orders/{id}`          | One order                                     |
| POST   | `/api/orders/{id}/preview`          | Draft the pieces for a set of options, without saving (the live redraw) |
| POST   | `/api/orders/{id}/mockups`          | Save a revision and draft its pieces          |
| GET    | `/api/orders/{id}/mockups/{v}`      | One saved revision and its pieces             |
| GET    | `/api/fabrics`                      | Fabric list                                   |
| GET    | `/api/analyze-photo/status`         | Who can read photos: `anthropic`, `ollama` or `none` |
| POST   | `/api/analyze-photo`                | Read a photo (`{ "image": "data:image/jpeg;base64,..." }`) |
| GET/POST/DELETE | `/api/pieces`, `/api/pieces/{id}` | Pieces in the cutting layout       |
| POST   | `/api/pack`                         | Nest the layout pieces on the fabric          |
| POST   | `/api/draft`, `/api/grade`, `/api/grade-child` | Older bodice drafting and size-run endpoints |

`POST /api/pack` takes `{ "fabricWidth": 150, "seamAllowance": 1, "resolution": 1.0 }`
and returns the placed pieces (each with its real `pathData` and a
`tx`/`ty`/`rotation`), the fabric length used, `efficiency` (%), `wasteArea`, and
`unplaced` (pieces that didn't fit).

The pattern options an order takes (fit, sleeves, collar, front, back, hem,
neckline, trim, panel, motifs and pattern, trousers, skirt, merch, accessories)
are the fields of `draft.ShirtOptions` in `backend/draft/shirt.go`.

## Data and privacy

- Orders are saved in `backend/orders.json`. It holds customer names, contact
  details and reference photos, so it is git-ignored. Keep it out of the repository.
- There is **no login and the API allows requests from any website**. It is meant
  to run on your own machine. Do not put it on the internet as it is: anyone could
  read the orders, and the photo endpoint would spend your Claude credits.
- With the Claude API, a photo is sent to Anthropic. With a local Ollama model it
  never leaves your machine.

## Known limitations and next steps

- **More efficient cutting.** The nester uses a grid check on real outlines, not a
  true no-fit-polygon algorithm. This was researched properly, not just noted:
  placement scoring by contact with already-placed fabric, trying several piece
  orderings, and a post-placement compaction pass were each implemented and
  measured against this app's own real drafted pieces (a small shirt's pieces
  and a real 3-size, 260-instance combined marker). All three came back
  no-better-or-worse at real extra cost (up to 4x slower) and were reverted —
  see `backend/nesting/irregular_test.go` for the two regression tests that
  came out of that work. Closing the real gap to commercial (~85-92%) efficiency
  needs an actual different algorithm — a true no-fit-polygon nester with a
  genetic/metaheuristic search over piece order *and* rotation, the way
  [SVGnest](https://github.com/Jack000/SVGnest)/Deepnest do — which is a
  multi-day-to-multi-week build, not a heuristic tweak. Real marker-making also
  treats grainline as a hard rule, not a tuning knob (a piece cut off-grain
  hangs and washes wrong); this app already respects that — every drafted
  garment piece sent to the layout is grain-locked (only 180° flips) — so
  "allow more rotation" is not a lever worth pulling here.
- **The 2D preview's sleeve cap and collar are re-derived, not traced.** The
  torso, leg and skirt outlines read their real drafted geometry (Landmarks,
  path points) directly off the cutting piece. The sleeve cap and the collar
  illustration instead pull a handful of scalars (cap height, stand height,
  point length...) off their pieces and reconstruct the visible shape with
  their own separate, hand-tuned curve constants — so a shirt whose sleeve-cap
  "fullness" or collar proportions genuinely differ from the illustration's own
  assumptions would look the same in the picture even though it's cut
  differently. Fixing this means tracing the actual drafted curves (see
  `draft.go`'s `solveSleeveCap`/`sleeveCapControls` for the sleeve, and the
  collar leaf/stand pieces' own path data) onto the flat layout's frame — real,
  valuable geometry work, but it reshapes a part of the illustration that took
  many rounds of visual back-and-forth to get right, so it needs the same kind
  of live "does this look right" review, not a one-shot change.
- **Backend option lists are still hand-duplicated in the frontend.**
  `DartPositions`, `MotifPlacements`, `MotifPatterns`, the pocket segment→anchor
  table, and the pocket corner-rounding math each exist once in
  `backend/draft/*.go` and again, by hand, in the frontend (comments on each
  copy say so). The pocket corner math was brought back in sync with the
  backend's exact formula (see `frontend/src/lib/__tests__/pocketShapes.test.js`);
  the option lists and the anchor table are still two copies kept in sync by a
  promise in a comment, not by the compiler. Serving them from a small
  `/api/catalog`-style endpoint (the app already does this for `/api/fabrics`)
  would close this properly.
- **Printed fabric** (a batik cloth) is shown as a pattern fill on motif bands
  and contrast pockets, not modelled as fabric with its own cutting rules.
  Drop-shoulder and kimono sleeves, side vents and ruffles are not in the
  catalog.
- **Drafts are proportional blocks, not fitted patterns.** They follow published
  drafting references (see below) but are not a substitute for a fitting: make a
  muslin before cutting production fabric.
- **Grading** (the older size-run endpoints) applies one fixed increment per step.
  Check the smallest and largest sizes against a real chart.
- **Only pieces added by hand or sent from an order** are in the cutting layout,
  and the layout list resets when the backend restarts.

## References

Drafting numbers were checked against these while building the trouser and
collar work:

- [How to Draft a Men's Pants Pattern From Scratch](https://sewingforaliving.com/how-to-draft-a-mens-pants-pattern-from-scratch/) (crotch extensions, leg widths, fly)
- [Men's Pants Pattern Drafting from Measurement](https://www.textileblog.com/mens-pants-pattern-drafting-from-measurement/) (waist, seat, dart sizes)
- [PC PRO Block #006 Trouser Block](https://nunohan.substack.com/p/pc-pro-block-006-trouser-block) and [#006.5 Back Panel](https://nunohan.substack.com/p/pc-pro-block-0065-trouser-block-back) (front and back crotch widths, hem)
- [Draft a Two-Piece Collar with a Stand](https://www.threadsmagazine.com/project-guides/fit-and-sew-tops/draft-a-two-piece-collar-with-a-stand) (collar stand and leaf)
