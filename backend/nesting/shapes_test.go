package nesting

import (
	"reflect"
	"testing"
)

// A few real-looking pattern shapes: a shirt-front-like piece with a curved
// neck and armhole, a sleeve-like trapezoid, an L, and a small triangle.
var testShapes = []NestPiece{
	{Name: "front", PathData: "M0,0 L14,0 C14,6 18,8 22,12 L22,70 L0,70 Z", Width: 22, Height: 70, Qty: 4, GrainLocked: true},
	{Name: "sleeve", PathData: "M6,0 L30,0 L36,22 L0,22 Z", Width: 36, Height: 22, Qty: 4, GrainLocked: true},
	{Name: "ell", PathData: "M0,0 L20,0 L20,8 L8,8 L8,30 L0,30 Z", Width: 20, Height: 30, Qty: 3, GrainLocked: true},
	{Name: "tri", PathData: "M0,0 L12,0 L0,16 Z", Width: 12, Height: 16, Qty: 5, GrainLocked: false},
}

// cellsOf rasterises a placed piece on a common 0.1 cm grid, independently of
// the nester's own grid.
func cellsOf(p PlacedPolygon, cols, rows int) mask {
	pts := RotatePoints(ParsePath(p.PathData), p.Rotation)
	moved := make([]Point, len(pts))
	for i, q := range pts {
		moved[i] = Point{q.X + p.TX, q.Y + p.TY}
	}
	return scanlineFill(moved, 0.1, cols, rows)
}

// No two placed pieces may share any part of the fabric, whatever their shape.
func TestCurvedPiecesNeverOverlap(t *testing.T) {
	res := PackPolygons(testShapes, 90, 0.25, 0)
	if len(res.Unplaced) != 0 {
		t.Fatalf("unplaced: %v", res.Unplaced)
	}
	cols, rows := 900+1, int(res.TotalHeight*10)+20
	used := make(mask, rows)
	for r := range used {
		used[r] = make([]bool, cols)
	}
	for _, p := range res.Placed {
		m := cellsOf(p, cols, rows)
		for r := range m {
			for c := range m[r] {
				if !m[r][c] {
					continue
				}
				if used[r][c] {
					t.Fatalf("%s overlaps another piece at row %d col %d", p.Name, r, c)
				}
				used[r][c] = true
			}
		}
	}
}

func TestEveryPieceStaysOnTheFabric(t *testing.T) {
	res := PackPolygons(testShapes, 60, 0.25, 0)
	for _, p := range res.Placed {
		pts := RotatePoints(ParsePath(p.PathData), p.Rotation)
		minX, minY, maxX, maxY := BoundingBox(pts)
		if minX+p.TX < -0.01 || maxX+p.TX > 60.01 || minY+p.TY < -0.01 || maxY+p.TY > res.TotalHeight+0.01 {
			t.Errorf("%s sticks out of the fabric: x %.1f..%.1f y %.1f..%.1f (height %.1f)", p.Name, minX+p.TX, maxX+p.TX, minY+p.TY, maxY+p.TY, res.TotalHeight)
		}
	}
}

// The same input always gives the same layout.
func TestPackingIsRepeatable(t *testing.T) {
	a := PackPolygons(testShapes, 90, 0.25, 0)
	b := PackPolygons(testShapes, 90, 0.25, 0)
	if !reflect.DeepEqual(a, b) {
		t.Error("two runs of the same input differ")
	}
}

// Trying more orders can only help: never longer than a single largest-first pass.
func TestSearchNeverLosesToASinglePass(t *testing.T) {
	multi := PackPolygons(testShapes, 90, 0.25, 0)
	single := PackPolygonsWithin(testShapes, 90, 0.25, 0, 0) // budget 0: first order only
	if multi.TotalHeight > single.TotalHeight+1e-9 {
		t.Errorf("search made it longer: %.1f vs %.1f", multi.TotalHeight, single.TotalHeight)
	}
}

// Efficiency is the pieces' area over the fabric used.
func TestEfficiencyMatchesPlacedArea(t *testing.T) {
	res := PackPolygons(testShapes, 90, 0.25, 0)
	var area float64
	for _, p := range testShapes {
		area += PolygonArea(ParsePath(p.PathData)) * float64(p.Qty)
	}
	want := area / (90 * res.TotalHeight) * 100
	if d := res.Efficiency - want; d > 0.3 || d < -0.3 { // TotalHeight is rounded to 0.1 cm
		t.Errorf("efficiency %.2f, want %.2f", res.Efficiency, want)
	}
	if res.Efficiency < 60 {
		t.Errorf("suspiciously loose layout: %.1f%%", res.Efficiency)
	}
}

// Something wider than the fabric is reported, quickly, and doesn't stop the rest.
func TestTooWideAPieceIsReportedNotLooped(t *testing.T) {
	pieces := []NestPiece{
		{Name: "huge", PathData: RectPath(200, 10), Width: 200, Height: 10, Qty: 1, GrainLocked: true},
		{Name: "ok", PathData: RectPath(20, 10), Width: 20, Height: 10, Qty: 2, GrainLocked: true},
	}
	res := PackPolygons(pieces, 100, 0.25, 0)
	if len(res.Unplaced) != 1 || res.Unplaced[0] != "huge" || res.PieceCount != 2 {
		t.Errorf("placed %d, unplaced %v", res.PieceCount, res.Unplaced)
	}
}

// One-way fabric keeps every piece facing the same way; two-way fabric may turn
// pieces end for end, which packs tighter.
func TestOneWayNeverTurnsPiecesAndCostsCloth(t *testing.T) {
	// Right-angled trapezoids interlock head-to-tail only when one is turned over.
	pieces := []NestPiece{{Name: "panel", PathData: "M0,0 L10,0 L20,40 L0,40 Z", Width: 20, Height: 40, Qty: 8, GrainLocked: true}}
	twoWay := PackPolygons(pieces, 80, 0.25, 0)
	pieces[0].OneWay = true
	oneWay := PackPolygons(pieces, 80, 0.25, 0)
	for _, p := range oneWay.Placed {
		if p.Rotation != 0 {
			t.Fatalf("a one-way piece was turned %d°", p.Rotation)
		}
	}
	if oneWay.TotalHeight < twoWay.TotalHeight {
		t.Errorf("one-way (%.1f cm) should never beat two-way (%.1f cm)", oneWay.TotalHeight, twoWay.TotalHeight)
	}
	if oneWay.TotalHeight == twoWay.TotalHeight {
		t.Logf("no extra cloth for this shape (%.1f cm both ways)", oneWay.TotalHeight)
	}
}
