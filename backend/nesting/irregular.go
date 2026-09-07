package nesting

import (
	"math"
	"sort"
)

// NestPiece is a pattern piece as fed into the polygon nester — it
// carries its real outline (PathData), not just a bounding box.
type NestPiece struct {
	Name        string
	Color       string
	GrainLocked bool
	PathData    string  // SVG path, local coords (cm), origin at the piece's own top-left
	Width       float64 // bounding box of PathData, unrotated
	Height      float64
	Qty         int
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
	rawPath     string  // original path string, unmodified, sent back to the frontend as-is
	points      []Point // parsed outline, local coords
	origW       float64
	origH       float64
}

// maxSearchRows caps how far down the fabric roll the placement
// search will look, as a safety net against an unplaceable piece
// (e.g. wider than the fabric in every rotation) spinning forever.
const maxSearchRows = 6000

// PackPolygons lays out every piece (expanded by quantity) onto a
// fabric roll of fabricWidth, using each piece's real curved outline
// for collision detection instead of its bounding box. resolution is
// the grid cell size in cm (smaller = tighter packing, slower run);
// 1.0 is a good default.
func PackPolygons(pieces []NestPiece, fabricWidth, seamAllowance, resolution float64) PolygonResult {
	if resolution <= 0 {
		resolution = 1.0
	}
	dilateRadius := int(math.Ceil(seamAllowance / resolution))

	var instances []instance
	for _, p := range pieces {
		pts := ParsePath(p.PathData)
		for i := 0; i < p.Qty; i++ {
			instances = append(instances, instance{
				name: p.Name, color: p.Color, grainLocked: p.GrainLocked,
				rawPath: p.PathData, points: pts, origW: p.Width, origH: p.Height,
			})
		}
	}

	// Largest pieces first — same reasoning as the rectangle shelf
	// packer: placing big pieces while the fabric is still empty
	// leaves better-shaped gaps for the smaller pieces that follow.
	sort.Slice(instances, func(i, j int) bool {
		return math.Max(instances[i].origW, instances[i].origH) >
			math.Max(instances[j].origW, instances[j].origH)
	})

	fabricCols := int(math.Ceil(fabricWidth / resolution))
	var occ mask

	ensureRows := func(need int) {
		for len(occ) < need {
			occ = append(occ, make([]bool, fabricCols))
		}
	}

	var placed []PlacedPolygon
	var unplaced []string
	maxRowUsed := 0
	placedArea := 0.0

	for _, inst := range instances {
		rotations := []int{0, 180}
		if !inst.grainLocked {
			rotations = []int{0, 90, 180, 270}
		}

		type candidate struct {
			rot        int
			m          mask
			cols, rows int
			minX, minY float64 // bbox of the rotated (unshifted) points
			fx, fy     int
			found      bool
		}

		var best *candidate
		for _, rot := range rotations {
			rp := RotatePoints(inst.points, rot)
			minX, minY, _, _ := BoundingBox(rp)
			m, cols, rows, _, _ := buildMask(rp, resolution, dilateRadius)
			if dilateRadius > 0 {
				m = dilate(m, dilateRadius)
			}
			if cols > fabricCols {
				continue // can't fit in this orientation at all, regardless of position
			}

			fx, fy, found := findPlacement(m, cols, rows, &occ, fabricCols, ensureRows)
			if !found {
				continue
			}
			cand := candidate{rot, m, cols, rows, minX, minY, fx, fy, found}
			if best == nil || fy < best.fy || (fy == best.fy && fx < best.fx) {
				best = &cand
			}
		}

		if best == nil {
			unplaced = append(unplaced, inst.name)
			continue
		}

		// Stamp the occupancy grid.
		ensureRows(best.fy + best.rows)
		for r := 0; r < best.rows; r++ {
			for c := 0; c < best.cols; c++ {
				if best.m[r][c] {
					occ[best.fy+r][best.fx+c] = true
				}
			}
		}
		if best.fy+best.rows > maxRowUsed {
			maxRowUsed = best.fy + best.rows
		}

		margin := float64(dilateRadius) * resolution
		tx := float64(best.fx)*resolution - best.minX + margin
		ty := float64(best.fy)*resolution - best.minY + margin

		placed = append(placed, PlacedPolygon{
			Name: inst.name, Color: inst.color, GrainLocked: inst.grainLocked,
			PathData: inst.rawPath, OrigWidth: inst.origW, OrigHeight: inst.origH,
			TX: round1(tx), TY: round1(ty), Rotation: best.rot,
		})
		placedArea += PolygonArea(inst.points)
	}

	totalHeight := float64(maxRowUsed) * resolution
	fabricArea := fabricWidth * totalHeight
	efficiency := 0.0
	if fabricArea > 0 {
		efficiency = placedArea / fabricArea * 100
	}

	return PolygonResult{
		Placed:      placed,
		FabricWidth: fabricWidth,
		TotalHeight: round1(totalHeight),
		Efficiency:  efficiency,
		WasteArea:   round1(fabricArea - placedArea),
		PieceCount:  len(placed),
		Unplaced:    unplaced,
	}
}

// findPlacement scans the fabric grid bottom-left-first (lowest row,
// then lowest column) for a spot where mask m fits without
// overlapping anything already occupied. Growing the occupancy grid
// on demand via ensureRows means the fabric roll has no fixed length.
func findPlacement(m mask, cols, rows int, occ *mask, fabricCols int, ensureRows func(int)) (fx, fy int, found bool) {
	if cols > fabricCols {
		return 0, 0, false
	}
	for fy = 0; fy < maxSearchRows; fy++ {
		ensureRows(fy + rows)
		for fx = 0; fx <= fabricCols-cols; fx++ {
			if fits(m, rows, cols, *occ, fx, fy) {
				return fx, fy, true
			}
		}
	}
	return 0, 0, false
}

func fits(m mask, rows, cols int, occ mask, fx, fy int) bool {
	for r := 0; r < rows; r++ {
		occRow := occ[fy+r]
		mRow := m[r]
		for c := 0; c < cols; c++ {
			if mRow[c] && occRow[fx+c] {
				return false
			}
		}
	}
	return true
}
