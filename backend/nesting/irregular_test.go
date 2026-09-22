package nesting

import "testing"

// placedBox is a placed rectangle's axis-aligned extent on the fabric, after
// its rotation and translation — rectangles stay axis-aligned under every
// rotation this nester uses (0/90/180/270), so this is exact, not an
// approximation.
func placedBox(p PlacedPolygon) (minX, minY, maxX, maxY float64) {
	pts := RotatePoints(ParsePath(p.PathData), p.Rotation)
	minX, minY, maxX, maxY = BoundingBox(pts)
	return minX + p.TX, minY + p.TY, maxX + p.TX, maxY + p.TY
}

func boxesOverlap(a, b PlacedPolygon) bool {
	ax0, ay0, ax1, ay1 := placedBox(a)
	bx0, by0, bx1, by1 := placedBox(b)
	const eps = 1e-6 // pieces are allowed to touch edge-to-edge, not overlap
	return ax0 < bx1-eps && bx0 < ax1-eps && ay0 < by1-eps && by0 < ay1-eps
}

// PackPolygons had no test coverage at all before this — these two pin its
// two most important invariants (no two placed pieces overlap, and a
// grain-locked piece is never rotated off-grain to make it fit) so a future
// change to the placement search can't silently break either one.
func TestPackPolygonsNoOverlap(t *testing.T) {
	pieces := []NestPiece{
		{Name: "front", PathData: RectPath(40, 60), Width: 40, Height: 60, Qty: 2, GrainLocked: true},
		{Name: "sleeve", PathData: RectPath(25, 35), Width: 25, Height: 35, Qty: 2, GrainLocked: true},
		{Name: "cuff", PathData: RectPath(10, 8), Width: 10, Height: 8, Qty: 4, GrainLocked: false},
	}
	res := PackPolygons(pieces, 150, 1, 0.5)
	if len(res.Unplaced) != 0 {
		t.Fatalf("everything should fit on a 150cm roll: unplaced %v", res.Unplaced)
	}
	if res.PieceCount != 8 {
		t.Fatalf("want 8 placed pieces (2+2+4 of qty), got %d", res.PieceCount)
	}
	for i := 0; i < len(res.Placed); i++ {
		for j := i + 1; j < len(res.Placed); j++ {
			if boxesOverlap(res.Placed[i], res.Placed[j]) {
				t.Errorf("pieces %d (%s) and %d (%s) overlap", i, res.Placed[i].Name, j, res.Placed[j].Name)
			}
		}
	}
}

func TestGrainLockedOnlyFlips(t *testing.T) {
	// A piece too wide to fit at 0/180 but that would fit if turned 90/270 —
	// grain-locked must still fail to place; free to rotate, it must succeed.
	// Real marker-making treats this as a hard rule, not a tuning knob: a
	// piece cut off its printed grainline hangs and washes wrong.
	wide := NestPiece{Name: "panel", PathData: RectPath(140, 20), Width: 140, Height: 20, Qty: 1}

	locked := wide
	locked.GrainLocked = true
	if res := PackPolygons([]NestPiece{locked}, 100, 0, 1); len(res.Unplaced) != 1 {
		t.Errorf("a grain-locked piece must not be rotated to fit off-grain: %+v", res)
	}

	free := wide
	free.GrainLocked = false
	res := PackPolygons([]NestPiece{free}, 100, 0, 1)
	if len(res.Unplaced) != 0 {
		t.Fatalf("a piece free to rotate should fit turned 90°: %+v", res)
	}
	if res.Placed[0].Rotation != 90 && res.Placed[0].Rotation != 270 {
		t.Errorf("expected a 90/270 turn to make it fit, got rotation %d", res.Placed[0].Rotation)
	}
}
