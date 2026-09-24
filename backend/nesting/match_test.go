package nesting

import (
	"math"
	"testing"
)

// placedBounds is where a placed piece really lies on the fabric.
func placedBounds(p PlacedPolygon) (minX, minY, maxX, maxY float64) {
	pts := RotatePoints(ParsePath(p.PathData), p.Rotation)
	minX, minY, maxX, maxY = BoundingBox(pts)
	return minX + p.TX, minY + p.TY, maxX + p.TX, maxY + p.TY
}

// onRepeat says whether v lies on a multiple of repeat, within the placement
// grid's rounding (TX/TY are kept to 0.1 cm, the grid is 0.25 cm).
func onRepeat(v, repeat float64) bool {
	r := math.Mod(v, repeat)
	return r < 0.2 || repeat-r < 0.2
}

func TestStripedPiecesSitOnTheRepeat(t *testing.T) {
	pieces := []NestPiece{
		{Name: "front", PathData: "M0,0 L14,0 C14,6 18,8 22,12 L22,70 L0,70 Z", Width: 22, Height: 70, Qty: 4, GrainLocked: true, MatchLength: 5, MatchWidth: 4, MatchX: 0},
		{Name: "sleeve", PathData: "M6,0 L30,0 L36,22 L0,22 Z", Width: 36, Height: 22, Qty: 4, GrainLocked: true, MatchLength: 5, MatchWidth: 4, MatchX: 18},
		{Name: "cuff", PathData: RectPath(12, 6), Width: 12, Height: 6, Qty: 4, GrainLocked: true},
	}
	res := PackPolygons(pieces, 110, 0.25, 0)
	if len(res.Unplaced) != 0 {
		t.Fatalf("unplaced %v", res.Unplaced)
	}
	for _, p := range res.Placed {
		if p.Name == "cuff" {
			continue
		}
		if p.Rotation != 0 {
			t.Errorf("%s turned %d° although it is matched", p.Name, p.Rotation)
		}
		minX, _, _, maxY := placedBounds(p)
		if !onRepeat(maxY, 5) {
			t.Errorf("%s: bottom at %.2f cm is not on a 5 cm stripe", p.Name, maxY)
		}
		anchor := minX
		if p.Name == "sleeve" {
			anchor += 18
		}
		if !onRepeat(anchor, 4) {
			t.Errorf("%s: anchor at %.2f cm is not on a 4 cm stripe", p.Name, anchor)
		}
	}
	plain := PackPolygons([]NestPiece{
		{Name: "front", PathData: pieces[0].PathData, Width: 22, Height: 70, Qty: 4, GrainLocked: true},
		{Name: "sleeve", PathData: pieces[1].PathData, Width: 36, Height: 22, Qty: 4, GrainLocked: true},
		{Name: "cuff", PathData: RectPath(12, 6), Width: 12, Height: 6, Qty: 4, GrainLocked: true},
	}, 110, 0.25, 0)
	if res.TotalHeight < plain.TotalHeight {
		t.Errorf("matching stripes (%.1f cm) should never need less cloth than plain (%.1f cm)", res.TotalHeight, plain.TotalHeight)
	}
}

func TestFoldPiecesSitOnTheFabricEdge(t *testing.T) {
	half := "M0,0 L14,0 C14,6 18,8 22,12 L22,60 L0,60 Z"
	res := PackPolygons([]NestPiece{
		{Name: "front", PathData: half, Width: 22, Height: 60, Qty: 3, GrainLocked: true, FoldAtEdge: true},
		{Name: "sleeve", PathData: "M6,0 L30,0 L36,22 L0,22 Z", Width: 36, Height: 22, Qty: 2, GrainLocked: true},
	}, 90, 0.25, 0)
	if len(res.Unplaced) != 0 {
		t.Fatalf("unplaced %v", res.Unplaced)
	}
	for _, p := range res.Placed {
		if p.Name != "front" {
			continue
		}
		minX, _, maxX, _ := placedBounds(p)
		switch p.Rotation {
		case 0:
			if minX > 0.1 {
				t.Errorf("fold should be on the left edge, piece starts at %.2f", minX)
			}
		case 180:
			if maxX < 90-0.1 {
				t.Errorf("fold should be on the right edge, piece ends at %.2f", maxX)
			}
		default:
			t.Errorf("fold piece turned %d°", p.Rotation)
		}
	}
	// Moving pieces onto the edge must not push them into each other.
	cols, rows := 901, int(res.TotalHeight*10)+20
	used := make(mask, rows)
	for r := range used {
		used[r] = make([]bool, cols)
	}
	for _, p := range res.Placed {
		m := cellsOf(p, cols, rows)
		for r := range m {
			for c := range m[r] {
				if m[r][c] && used[r][c] {
					t.Fatalf("%s overlaps another piece", p.Name)
				}
				if m[r][c] {
					used[r][c] = true
				}
			}
		}
	}
}

func TestUnfoldPathMakesTheWholePiece(t *testing.T) {
	half := "M0,0 L14,0 C14,6 18,8 22,12 L22,60 L0,60 Z"
	whole, w := UnfoldPath(half)
	if w != 44 {
		t.Fatalf("width %v, want 44", w)
	}
	a := PolygonArea(ParsePath(half))
	if got := PolygonArea(ParsePath(whole)); math.Abs(got-2*a) > 0.5 {
		t.Errorf("area %.1f, want twice the half (%.1f)", got, 2*a)
	}
	minX, _, maxX, _ := BoundingBox(ParsePath(whole))
	if minX != 0 || maxX != 44 {
		t.Errorf("bounds %v..%v, want 0..44", minX, maxX)
	}
}
