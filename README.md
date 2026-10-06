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
- **Two shirt blocks.** School and uniform shirts can be cut in the classic
  block, sized from each size's body measurements, or in the **Konveksi
  uniform** block: the shop's own short-sleeve uniform, taken off Dad's size-M
  paper patterns (`backend/draft/konveksi.go`).
  - **The cut:** a 98 cm chest, a wide flat shoulder set forward, a low sleeve
    cap with almost no ease, a 5.1 cm stand collar with a stiff inner layer,
    and a front that folds back 2.5 cm with a 3.2 cm lidah over the buttons.
  - **Allowances:** 0.5 cm seams, a 1.5 cm shirt hem and a 2.5 cm sleeve hem.
  - **Sizing by chart:** the shop chart grows 3 cm laid flat (6 cm round) per
    size, with the shoulder, neck, armhole, length and sleeve in proportion.
    Set any one size's chest or length and every size up and down follows.
    Sizes named XS to 7XL are cut from the chart; any other size by its chest
    plus 6 cm.
  - **Wide hips:** a size whose hip measurement is wider than its hem gets its
    side seams flared out from the underarm, until the hem clears the hip by
    2 cm. Every other size keeps Dad's straight sides.
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
- **Logos.** Upload the customer's logo (PNG, JPG or SVG) as embroidery or
  sablon: from Extras, from the menu when you click the garment, or by dropping
  the file on the drawing. A plain background round the logo is cleared, the
  empty margin trimmed, and its colours counted: one screen per colour for
  sablon, one thread per colour for embroidery, or "full colour" for a photo
  (print it with DTF). The logo is drawn on the garment at its printed size and
  listed on the pattern sheet with its place, size and colours. A print can
  also be plain text, such as a name.
- **Working on the drawing.** Every change redraws in one step, at once: a
  tile is drafted while the pointer rests on it, drafts already made are
  reused, and the drawing always shows pieces and style from the same draft.
  Click a pocket or print to pick it: drag it, pull its corner handle to size
  it, use the small toolbar beside it (size, turn, copy to the other side,
  remove, more settings), or the keyboard (arrows move it, Shift for further,
  + and − size it, R turns it, Delete removes it, Escape lets go). Click a part
  of the garment to jump to its tiles ("Change the collar"). Design changes
  can be undone and redone (⌘Z / ⇧⌘Z, Ctrl+Z / Ctrl+Y, or the arrows in the
  toolbar).
- **Unsaved changes.** The order page marks edits that aren't saved yet, and
  asks before you leave with them: through the tabs, "All orders", the back
  button or closing the tab. It also keeps a copy of them in the browser, so
  after a crash or a power cut the order offers them back when it opens.
- **Motif bands.** A collar-to-hem streak, two streaks, chest band, shoulder
  band, hem band, arm bands or an insert side panel, in a solid colour or a
  pattern (stripes, batik, parang, chevron, dots, check). Each band adds its own
  strip to the cut list: a motif is a different cut of fabric.
- **Cutting layout.** Send an order's pieces (all sizes, with quantities) to the
  Cutting Layout tab, which nests them on the fabric width using their real
  outlines.
- **Full-size cut-outs (1:1).** From the pattern sheet, download any sizes as
  a PDF of every piece at real size: cutting line, dashed sewing line,
  grainline, fold and label. Either A4 sheets to tape together (a cover page
  with a map of the sheets, trim and join lines on every sheet) or one plotter
  roll (61, 91, 107 or 152 cm) for a print shop. Print at Actual size / 100%
  and check the 10 cm square on the first page. Collars (every style, both
  blocks) and the shop block's back are cut as whole pieces, as on Dad's
  paper pattern (drafted as halves for the measurements, unfolded for
  cutting).
- **SAI rolls are the standard.** The SAI (Sumber Agung Internusa) fabrics in
  the catalogue carry their roll size, 150 cm wide by about 30 yards (listed
  by sellers for six of them; the rest marked to check). The cutting plan
  starts from the order's fabric roll, or SAI's 150 cm when none is chosen,
  and says how many rolls to buy.
- **Reference photo.** Put a photo of an existing uniform beside the drawing,
  pick its fabric and trim colours by clicking it, and match the parts by eye.
  No key or service needed. Optionally, have the app read the photo for you
  (see [Photo reading](#photo-reading-optional)). The photo is kept with the
  order: **Hide** folds the panel away (on a phone it starts folded, so the
  design comes first) and **Start from → Show the reference photo** brings it
  back; **Remove photo** takes it off the order, after asking.

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
    pgstore/          PostgreSQL storage: orders, logos, layout pieces (Docker)
    artwork/          checks and keeps uploaded logos (a folder without Docker)
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
  docker/
    backup/           the weekly backup job (backup.sh, entrypoint.sh)
    restore.sh        put a backup back
  docker-compose.yml  the app, its database and the backups
```

## Running in Docker

This is the everyday way to run it: the app, a PostgreSQL database for its
data, and a weekly backup, all started together. You need Docker Desktop.

```bash
cp .env.example .env      # then set POSTGRES_PASSWORD (letters and digits only)
docker compose up -d --build
```

Open `http://localhost:8000`. The services restart by themselves after a
crash, for as long as Docker Desktop runs. Turn on Docker Desktop's
**Settings → General → Start Docker Desktop when you sign in**, or the app
stays down after the Mac restarts until someone opens Docker Desktop.

| Service   | What it does |
|-----------|--------------|
| `web`     | The app, served by nginx, which passes `/api` on to the backend |
| `backend` | The Go API, keeping its data in the database |
| `db`      | PostgreSQL 16. The data lives in the Docker volume `konveksi_pgdata` |
| `backup`  | Dumps the whole database into `./backups` every week |

**What the database holds.** Every order (one row each, the whole order as
JSONB, with the customer, garment, status and dates as columns), every
uploaded logo, and the Cutting Layout pieces, which now survive a restart.

**First start.** On a database that has never held an order, the backend
copies in what it kept before: `backend/orders.json` and the logos in
`backend/uploads/artwork/`. Those files are only read, never changed. After
that, Docker and `go run .` keep separate data: the database and the JSON file.

**Backups.** Every Sunday at 02:00 (Jakarta time), the `backup` service writes
`backups/konveksi_<date>.dump` and proves it by restoring it into a scratch
database and counting the orders that come back. It keeps the newest 8. A
backup that fails the restore test is set aside as `…_FAILED-CHECK.bad` and
doesn't count, so the orders page goes on warning until a good one is taken. A
Mac asleep or off at 02:00 on Sunday would skip that week, so it also checks
every hour, and when it starts, and takes a backup whenever the newest is 7
days old (`BACKUP_MAX_AGE_DAYS`): a missed week is made up within the hour of
the Mac being on. Change the day, time and number kept with
`BACKUP_SCHEDULE`, `BACKUP_KEEP` and `TZ` in `.env`. The backups sit on the same disk as the database, so copy the
`backups` folder somewhere else now and then (an external drive, a cloud
folder): a backup on the same disk doesn't survive that disk failing. Set
`BACKUP_COPY_DIR` in `.env` to an external drive or a synced folder (iCloud
Drive, Google Drive) and every verified backup is copied there too, with the
same number kept.

```bash
docker compose exec backup /scripts/backup.sh       # take a backup now
docker compose logs backup                          # when backups ran
./docker/restore.sh backups/konveksi_<date>.dump    # put one back
```

The restore replaces everything in the database with the backup, after
asking you to type `yes`. It takes a backup of the current data first
(`..._before-restore.dump`), so a restore can itself be undone.

**Other commands.**

```bash
docker compose ps                  # what is running
docker compose logs -f backend     # the backend's log
docker compose down                # stop (the data stays)
docker compose up -d --build       # start again, rebuilding after code changes
./docker/update.sh                 # the same, after a backup first: use this to update
```

Logs rotate (5 files of 10 MB per service), so months of running never fill
the disk. The backend finishes the requests it is working on before it
stops, so a save in progress during a restart isn't cut off.

`docker compose down -v` also deletes the database volume: only after a backup.

**Settings** (`.env`, see `.env.example`): `WEB_PORT` (8000) and `WEB_BIND`
(`127.0.0.1`, this computer only; `0.0.0.0` opens the app to the shop's
network, where anyone on it can use it: there is no login). `DB_PORT` (5433)
reaches the database from this computer only, for a database app. Keep
`POSTGRES_PASSWORD` as it is once the database exists: it was created with it.

To run the backend from source against the Docker database, stop the
`backend` service and run `go run .` with
`DATABASE_URL=postgres://konveksi:<password>@localhost:5433/konveksi?sslmode=disable`.

### On a phone, and from outside the shop (Tailscale)

The app works on a phone screen and can be installed like an app: it opens
full screen, with its own icon. On Android, Chrome's menu → **Install app**;
on an iPhone, Safari's Share → **Add to Home Screen**. Browsers install only
from `https://` (or `localhost`), and Tailscale gives the app an HTTPS address
of its own on your tailnet, reachable from anywhere a device is signed in to
it, without opening the app to the shop's Wi-Fi or the internet:

**`https://konveksi.<tailnet>.ts.net`**

That's the `tailscale` service in `docker-compose.yml`: a small Tailscale
node that joins the tailnet as its own device, named `konveksi`, and passes
visits on to the app (`docker/tailscale/serve.json`). It starts and stops
with the rest of the app, and doesn't depend on the Tailscale app on the Mac
or on how that's set up. Setting it up once:

1. In `.env`: `COMPOSE_PROFILES=tailscale`, and the address in
   `ALLOWED_HOSTS` (`konveksi.<tailnet>.ts.net`).
2. `./docker/tailscale/login.sh` shows a sign-in link and waits: open it and
   approve the device. The sign-in is saved, and from then on the container
   starts signed in. (Or put an auth key from the admin console, **Settings →
   Keys**, in `TS_AUTHKEY` before the first `docker compose up -d`, and it
   signs in by itself.) Don't sign in from the link in `docker compose logs
   tailscale`: the container waits only 60 seconds for that one, then
   restarts with a new link for a new device, and a late approval adds a
   device that no longer exists (remove it again under **Machines**).
3. In the admin console, **Machines → konveksi → ⋯ → Disable key expiry**, or
   it has to sign in again in about six months.

Its identity is kept in the Docker volume `konveksi_tailscale`; deleting the
volume makes it sign in again as a new device. `TS_HOSTNAME` changes the name.
`./docker/update.sh` also fetches the newest stable Tailscale image.

`WEB_BIND` stays `127.0.0.1`: Tailscale reaches the app inside Docker, not
through the Mac's network. The app has no login, so share it only with a
tailnet you trust (a Tailscale access rule can limit which devices reach
`konveksi`). It's reachable only while the Mac is awake and Docker Desktop is
running.

## Running it for development

Without Docker the backend keeps its data in files: the orders in
`backend/orders.json`, the logos in `backend/uploads/artwork/`, and the
Cutting Layout pieces in memory. You need Go 1.25+ (an older Go downloads
the right version by itself) and Node 22.

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

The PostgreSQL tests (`backend/pgstore`) are skipped unless they are given a
database server to make their throwaway databases on:

```bash
docker run -d --rm --name pgtest -e POSTGRES_PASSWORD=test -p 127.0.0.1:55432:5432 postgres:16-alpine
TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/postgres go test ./pgstore/
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
| POST   | `/api/artwork`                      | Store a logo (`{ "image": "data:image/png;base64,..." }`); answers `{ "id" }` |
| GET    | `/api/artwork/{id}`                 | A stored logo                                 |
| GET    | `/api/health`                       | Whether the backend and its storage answer (`{ "ok": true, "storage": "postgres" }`) |
| GET    | `/api/backups`                      | How many backups there are and when the newest was taken |
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

- In Docker, everything is in the PostgreSQL database and its backups in
  `backups/`. Without Docker, orders are saved in `backend/orders.json`. Both
  hold customer names, contact details and reference photos, so they are
  git-ignored, as is `.env` with the database password. Keep them out of the
  repository.
- **The repository is public**, and its history with it: a file committed
  once can be read by anyone even after it's deleted. `.gitignore` also keeps
  out other env files, database dumps, SQLite files, keys and certificates
  (e.g. from `tailscale cert`). A data file committed by mistake stays in the
  history after it's deleted; removing it takes rewriting the history
  (`git filter-repo`) and a force-push, or making the repository private.
- Uploaded logos are saved in `backend/uploads/artwork/` (set `ARTWORK_DIR` to
  change it), one file per picture, named by a hash of its contents. Orders
  only carry that name. The folder is git-ignored too. A logo removed from every
  design stays in the folder until you delete it.
- There is **no login**, so the server is careful about who it answers:
  - **Other websites can't use it.** A page on another site, open in the same
    browser, can't read, change or delete orders, or spend Claude credits: the
    API answers only the app's own page and the development servers
    (`CORS_ORIGINS` adds more).
  - **DNS rebinding is blocked.** The server answers only when it is reached
    as `localhost`, an IP address or a `.local` name. Add any other name the
    shop's computers use to `ALLOWED_HOSTS`.
  - **The page is locked down.** It may load only its own scripts and
    images and Google's fonts, and other sites can't frame it.
  - Even so, open it to the shop's network (`WEB_BIND=0.0.0.0`) only on a
    network you trust, and never put it on the internet as it is.
- **Two screens, one order.** If an order was saved on another screen after
  you opened it, your save is refused with a message, instead of silently
  undoing theirs. Reload the order to see their changes.
- **Backups are watched.** The orders page shows when the last backup ran,
  and warns when the newest is older than `BACKUP_WARN_DAYS` (8) or there is
  none.
- **Problems are logged.** The backend logs every request it failed and every
  slow one (`docker compose logs backend`), without the details reaching the
  browser.
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
