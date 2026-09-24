package nesting

import (
	"math"
	"math/rand"
	"sort"
	"time"
)

// NestPiece is a pattern piece as fed into the polygon nester — it
// carries its real outline (PathData), not just a bounding box.
type NestPiece struct {
	Name        string
	Color       string
	GrainLocked bool
	// OneWay stops a grain-locked piece being turned end for end, for fabric
	// with a direction (a nap, a batik or printed motif): every piece must face
	// the same way up.
	OneWay bool
	// MatchLength and MatchWidth are a stripe or check repeat (cm) the piece
	// must be matched to: its bottom edge on a repeat line along the roll, and
	// the line MatchX cm in from its left edge (its centre, or a fold) on a
	// repeat line across it. Matched pieces are never turned, since the stripes
	// must run the same way on every piece.
	MatchLength float64
	MatchWidth  float64
	MatchX      float64
	// FoldAtEdge puts the piece's left edge (a centre-front or centre-back
	// fold) on the fabric's edge, or turned end for end on the other edge: on
	// tubular knit both edges are folds, so the piece is cut there whole.
	FoldAtEdge bool
	PathData   string  // SVG path, local coords (cm), origin at the piece's own top-left
	Width      float64 // bounding box of PathData, unrotated
	Height     float64
	Qty        int
}

// PlacedPolygon is one instance of a piece after nesting. The
// frontend renders it by drawing the ORIGINAL PathData inside an SVG
// group with transform="translate(TX,TY) rotate(Rotation)" — SVG
// applies the rotate first, then the translate, which is exactly how
// these two numbers were computed.
type PlacedPolygon struct {
	Name        string  `json:"name"`
	Color       string  `json:"color"`
	GrainLocked bool    `json:"grainLocked"`
	PathData    string  `json:"pathData"`
	OrigWidth   float64 `json:"origWidth"`
	OrigHeight  float64 `json:"origHeight"`
	TX          float64 `json:"tx"`
	TY          float64 `json:"ty"`
	Rotation    int     `json:"rotation"`
}

// PolygonResult is the outcome of a polygon pack.
type PolygonResult struct {
	Placed      []PlacedPolygon `json:"placed"`
	FabricWidth float64         `json:"fabricWidth"`
	TotalHeight float64         `json:"totalHeight"`
	Efficiency  float64         `json:"efficiency"`
	WasteArea   float64         `json:"wasteArea"`
	PieceCount  int             `json:"pieceCount"`
	Unplaced    []string        `json:"unplaced,omitempty"`
}

type instance struct {
	name, color string
	grainLocked bool
	oneWay      bool
	matchLen    float64
	matchWid    float64
	matchX      float64
	foldAtEdge  bool
	rawPath     string  // original path string, unmodified, sent back to the frontend as-is
	points      []Point // parsed outline, local coords
	origW       float64
	origH       float64
	area        float64
}

// maxLengthCm caps how far down the fabric roll the placement search will look,
// as a safety net against an unplaceable piece (e.g. wider than the fabric in
// every rotation) spinning forever. A real marker is a few metres.
const maxLengthCm = 3000.0

// searchBudget bounds the time spent trying extra piece orderings once the
// first layout is done; a plain area-ordered layout is always produced.
const searchBudget = 3 * time.Second

// Grid cell sizes (cm). Finer cells pack tighter and cost more, so a very large
// piece list falls back to the coarser one.
const (
	fineResolution   = 0.25
	coarseResolution = 0.5
	fineMaxInstances = 300
)

// rasterKey identifies one piece in one orientation: every copy of a piece
// shares one rasterised shape.
type rasterKey struct {
	path string
	rot  int
}

type raster struct {
	shape      *shape
	minX, minY float64 // bounding box corner of the rotated (unshifted) points
	heightCm   float64
	widthCm    float64
}

type packer struct {
	resolution   float64
	dilateRadius int
	fabricCols   int
	fabricWidth  float64
	maxRows      int
	rasters      map[rasterKey]*raster
}

func (pk *packer) raster(inst instance, rot int) *raster {
	key := rasterKey{inst.rawPath, rot}
	if r, ok := pk.rasters[key]; ok {
		return r
	}
	rp := RotatePoints(inst.points, rot)
	minX, minY, _, _ := BoundingBox(rp)
	m, cols, rows, _, _ := buildMask(rp, pk.resolution, pk.dilateRadius)
	m = dilate(m, pk.dilateRadius)
	_, _, maxX, maxY := BoundingBox(rp)
	r := &raster{shape: newShape(m, cols, rows), minX: minX, minY: minY, heightCm: maxY - minY, widthCm: maxX - minX}
	pk.rasters[key] = r
	return r
}

// rule is where a piece may go in the grid, given its stripe matching and fold.
// A piece's raster has dilateRadius empty cells round it, so its real bottom
// edge is that many cells plus its height below the raster's top.
func (pk *packer) rule(inst instance, rot int, r *raster) placeRule {
	rule := freePlacement
	cells := func(cm float64) int { return int(math.Round(cm / pk.resolution)) }
	mod := func(a, m int) int { return ((a % m) + m) % m }
	if inst.matchLen > 0 {
		if step := cells(inst.matchLen); step > 0 {
			rule.yStep = step
			rule.yPhase = mod(-(pk.dilateRadius + cells(r.heightCm)), step)
		}
	}
	if inst.matchWid > 0 {
		if step := cells(inst.matchWid); step > 0 {
			rule.xStep = step
			rule.xPhase = mod(-(pk.dilateRadius + cells(inst.matchX)), step)
		}
	}
	if inst.foldAtEdge {
		rule.xStep, rule.xPhase = 0, 0
		if rot == 180 {
			rule.xOnly = max(0, pk.fabricCols-r.shape.cols)
		} else {
			rule.xOnly = 0
		}
	}
	return rule
}

// layout is one complete attempt at placing every instance.
type layout struct {
	placed     []PlacedPolygon
	unplaced   []string
	maxRowUsed int
	placedArea float64
}

// better says whether l should be preferred over o: everything placed first,
// then the shortest marker.
func (l *layout) better(o *layout) bool {
	if o == nil {
		return true
	}
	if len(l.unplaced) != len(o.unplaced) {
		return len(l.unplaced) < len(o.unplaced)
	}
	return l.maxRowUsed < o.maxRowUsed
}

// pack places the instances in the given order, each at the lowest, then
// leftmost, spot where it fits, trying every orientation the piece is allowed.
func (pk *packer) pack(order []instance, noFlip bool) *layout {
	grid := newBitGrid(pk.fabricCols)
	out := &layout{}
	margin := float64(pk.dilateRadius) * pk.resolution
	// The fabric only ever fills up, so a piece that found no room once never
	// will: later copies of it are reported without searching the roll again.
	type roomKey struct {
		rasterKey
		placeRule
	}
	noRoom := make(map[roomKey]bool)

	for _, inst := range order {
		rotations := []int{0, 180}
		switch {
		case inst.matchLen > 0 || inst.matchWid > 0:
			rotations = []int{0}
		case inst.foldAtEdge && inst.oneWay:
			rotations = []int{0}
		case inst.foldAtEdge:
			// Both orientations, since each puts the fold on a different edge.
		case !inst.grainLocked:
			rotations = []int{0, 90, 180, 270}
		case inst.oneWay || noFlip:
			rotations = []int{0}
		}
		var best *raster
		bestRot, bestX, bestY := 0, 0, 0
		for _, rot := range rotations {
			r := pk.raster(inst, rot)
			rule := pk.rule(inst, rot, r)
			key := roomKey{rasterKey{inst.rawPath, rot}, rule}
			if r.shape.cols > pk.fabricCols || noRoom[key] {
				continue // can't fit in this orientation at all, regardless of position
			}
			fx, fy, found := grid.findPlacement(r.shape, pk.maxRows, rule)
			if !found {
				noRoom[key] = true
				continue
			}
			if best == nil || fy < bestY || (fy == bestY && fx < bestX) {
				best, bestRot, bestX, bestY = r, rot, fx, fy
			}
		}
		if best == nil {
			out.unplaced = append(out.unplaced, inst.name)
			continue
		}

		grid.ensureRows(bestY + best.shape.rows)
		grid.stamp(best.shape, bestX, bestY)
		if bestY+best.shape.rows > out.maxRowUsed {
			out.maxRowUsed = bestY + best.shape.rows
		}
		tx := float64(bestX)*pk.resolution - best.minX + margin
		if inst.foldAtEdge {
			// The grid leaves up to a cell or two between the fold and the
			// fabric's edge, too thin for anything to be cut from; close it so
			// the fold is the edge.
			if bestRot == 0 {
				tx = -best.minX
			} else {
				tx = pk.fabricWidth - best.minX - best.widthCm
			}
		}
		ty := float64(bestY)*pk.resolution - best.minY + margin
		out.placed = append(out.placed, PlacedPolygon{
			Name: inst.name, Color: inst.color, GrainLocked: inst.grainLocked,
			PathData: inst.rawPath, OrigWidth: inst.origW, OrigHeight: inst.origH,
			TX: round1(tx), TY: round1(ty), Rotation: bestRot,
		})
		out.placedArea += inst.area
	}
	return out
}

// PackPolygons lays out every piece (expanded by quantity) onto a
// fabric roll of fabricWidth, using each piece's real curved outline
// for collision detection instead of its bounding box. resolution is
// the grid cell size in cm (smaller = tighter packing, slower run); 0
// picks a sensible one. seamAllowance is the breathing room kept around each
// piece.
//
// Placement is bottom-left-fill, which is sensitive to the order pieces are
// tried in, so several orders are tried (largest first, tallest first, widest
// first, and some seeded shuffles of the largest-first order) and the shortest
// complete layout wins. The result is the same every time for the same input.
func PackPolygons(pieces []NestPiece, fabricWidth, seamAllowance, resolution float64) PolygonResult {
	return PackPolygonsWithin(pieces, fabricWidth, seamAllowance, resolution, searchBudget)
}

// PackPolygonsWithin is PackPolygons with its own limit on how long to keep
// trying extra piece orders after the first layout.
func PackPolygonsWithin(pieces []NestPiece, fabricWidth, seamAllowance, resolution float64, budget time.Duration) PolygonResult {
	var instances []instance
	for _, p := range pieces {
		pts := ParsePath(p.PathData)
		area := PolygonArea(pts)
		for i := 0; i < p.Qty; i++ {
			instances = append(instances, instance{
				name: p.Name, color: p.Color, grainLocked: p.GrainLocked, oneWay: p.OneWay,
				matchLen: p.MatchLength, matchWid: p.MatchWidth, matchX: p.MatchX, foldAtEdge: p.FoldAtEdge,
				rawPath: p.PathData, points: pts, origW: p.Width, origH: p.Height, area: area,
			})
		}
	}

	if resolution <= 0 {
		resolution = coarseResolution
		if len(instances) <= fineMaxInstances {
			resolution = fineResolution
		}
	}
	pk := &packer{
		resolution:   resolution,
		dilateRadius: int(math.Ceil(seamAllowance / resolution)),
		fabricCols:   int(math.Ceil(fabricWidth / resolution)),
		fabricWidth:  fabricWidth,
		maxRows:      int(maxLengthCm / resolution),
		rasters:      make(map[rasterKey]*raster),
	}

	// Placement is greedy, so allowing more moves does not guarantee a better
	// layout. Where pieces may be turned end for end, the first few orders are
	// also tried without turning anything, and the shortest result is kept.
	canFlip := false
	for _, in := range instances {
		if in.grainLocked && !in.oneWay {
			canFlip = true
			break
		}
	}
	start := time.Now()
	var best *layout
	for i, order := range candidateOrders(instances) {
		if i > 0 && time.Since(start) > budget {
			break
		}
		if l := pk.pack(order, false); l.better(best) {
			best = l
		}
		if canFlip && i < 3 && time.Since(start) <= budget {
			if l := pk.pack(order, true); l.better(best) {
				best = l
			}
		}
	}
	if best == nil {
		best = &layout{}
	}

	totalHeight := float64(best.maxRowUsed) * resolution
	fabricArea := fabricWidth * totalHeight
	efficiency := 0.0
	if fabricArea > 0 {
		efficiency = best.placedArea / fabricArea * 100
	}
	return PolygonResult{
		Placed:      best.placed,
		FabricWidth: fabricWidth,
		TotalHeight: round1(totalHeight),
		Efficiency:  efficiency,
		WasteArea:   round1(fabricArea - best.placedArea),
		PieceCount:  len(best.placed),
		Unplaced:    best.unplaced,
	}
}

// candidateOrders are the piece orders to try, best guess first. Large
// instance lists get fewer, since each attempt costs more.
func candidateOrders(insts []instance) [][]instance {
	sorted := func(less func(a, b instance) bool) []instance {
		out := append([]instance(nil), insts...)
		sort.SliceStable(out, func(i, j int) bool { return less(out[i], out[j]) })
		return out
	}
	orders := [][]instance{sorted(func(a, b instance) bool { return a.area > b.area })}
	extra := 0
	switch n := len(insts); {
	case n <= 1:
		return orders
	case n <= 120:
		extra = 11
	case n <= 400:
		extra = 3
	default:
		return orders
	}
	orders = append(orders,
		sorted(func(a, b instance) bool { return a.origH > b.origH }),
		sorted(func(a, b instance) bool { return a.origW > b.origW }),
	)
	rng := rand.New(rand.NewSource(7))
	for i := 0; i < extra; i++ {
		keys := make(map[int]float64, len(insts))
		idx := make([]int, len(insts))
		for j := range insts {
			idx[j] = j
			keys[j] = insts[j].area * (0.6 + 0.8*rng.Float64())
		}
		sort.SliceStable(idx, func(a, b int) bool { return keys[idx[a]] > keys[idx[b]] })
		out := make([]instance, len(insts))
		for j, k := range idx {
			out[j] = insts[k]
		}
		orders = append(orders, out)
	}
	return orders
}
