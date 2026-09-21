package draft

import (
	"fmt"
	"math"
	"regexp"
	"strings"
)

// Design features seen on real uniforms that the basic shirt block doesn't
// have: a V-neck opening with a facing or contrast trim, a hidden placket,
// piping along a collar, and a contrast insert panel down one side of the
// front.

// vNeckDepthFactor is how deep the V goes, as a share of the armhole depth
// (about 21cm on an adult, 14 on a size-8 child).
const vNeckDepthFactor = 0.85

var frontNeckStart = regexp.MustCompile(`^M0\.0,(\S+) C\S+ \S+ (\S+),(\S+) L`)

// vNeckFront replaces the front piece's scooped neckline with a straight V
// from the neck point down to center front at depth.
func vNeckFront(p Piece, depth float64) Piece {
	m := frontNeckStart.FindStringSubmatchIndex(p.PathData)
	if m == nil {
		return p
	}
	oldY, x, y := p.PathData[m[2]:m[3]], p.PathData[m[4]:m[5]], p.PathData[m[6]:m[7]]
	rest := p.PathData[m[1]:]
	// The path closes back to its first point along the fold; move that too.
	rest = strings.TrimSuffix(rest, fmt.Sprintf("L0.0,%s Z", oldY)) + fmt.Sprintf("L0.0,%.1f Z", depth)
	p.PathData = fmt.Sprintf("M0.0,%.1f L%s,%s L", depth, x, y) + rest
	p.Notes += " V-neck: the neckline is a straight line from the neck point to center front, finished with a facing or trim."
	return p
}

// clipX keeps the part of a polygon between the vertical lines x = lo and
// x = hi (Sutherland-Hodgman against each line in turn).
func clipX(poly []point, lo, hi float64) []point {
	clip := func(in []point, inside func(point) bool, cross func(a, b point) point) []point {
		var out []point
		for i := range in {
			a, b := in[i], in[(i+1)%len(in)]
			switch {
			case inside(a) && inside(b):
				out = append(out, b)
			case inside(a) && !inside(b):
				out = append(out, cross(a, b))
			case !inside(a) && inside(b):
				out = append(out, cross(a, b), b)
			}
		}
		return out
	}
	at := func(x float64) func(a, b point) point {
		return func(a, b point) point {
			t := (x - a.x) / (b.x - a.x)
			return point{x, a.y + (b.y-a.y)*t}
		}
	}
	out := clip(poly, func(p point) bool { return p.x >= lo }, at(lo))
	if len(out) < 3 {
		return nil
	}
	out = clip(out, func(p point) bool { return p.x <= hi }, at(hi))
	if len(out) < 3 {
		return nil
	}
	return out
}

// polyPiece is a polygon moved to the origin as a cutting piece. The
// offset it was taken from (in the piece it was cut out of) goes in the
// "offset" landmark so a drawing can put it back.
func polyPiece(name string, poly []point) Piece {
	minX, minY := math.Inf(1), math.Inf(1)
	for _, p := range poly {
		minX, minY = math.Min(minX, p.x), math.Min(minY, p.y)
	}
	pb := &pathBuilder{}
	maxX, maxY := 0.0, 0.0
	for i, p := range poly {
		q := point{round1(p.x - minX), round1(p.y - minY)}
		if i == 0 {
			pb.moveTo(q)
		} else {
			pb.lineTo(q)
		}
		maxX, maxY = math.Max(maxX, q.x), math.Max(maxY, q.y)
	}
	pb.close()
	return Piece{
		Name:      name,
		PathData:  pb.String(),
		Width:     round1(maxX),
		Height:    round1(maxY),
		Landmarks: map[string]Point{"offset": {X: round1(minX), Y: round1(minY)}},
	}
}

// Where the insert panel sits across the front half, as shares of its width
// from center front.
const (
	panelFrom = 0.47
	panelTo   = 0.88
)

// insertPanelPieces splits a front half into the part between center front
// and the panel, the contrast panel itself, and the part outside it (toward
// the armhole). Any of the three may be missing on an unusual outline.
func insertPanelPieces(front Piece) (inner, panel, outer *Piece) {
	poly := flattenPath(front.PathData)
	if len(poly) < 3 {
		return
	}
	w := 0.0
	for _, p := range poly {
		w = math.Max(w, p.x)
	}
	a, b := w*panelFrom, w*panelTo
	build := func(name string, lo, hi float64, note string) *Piece {
		part := clipX(poly, lo, hi)
		if part == nil {
			return nil
		}
		pc := polyPiece(name, part)
		pc.Notes = note
		return &pc
	}
	inner = build("Front inner (panel side)", -1, a, "Cut 1. The front's center-front side on the side that carries the insert panel; join it to the panel along the cut line.")
	panel = build("Insert panel", a, b, "Cut 1 in the contrast (batik or printed) fabric. It sits between the two front pieces of that side, shoulder to hem; seam allowance is included.")
	outer = build("Front outer (panel side)", b, w+1, "Cut 1. The armhole side of the front on the side that carries the insert panel.")
	return
}

// neckTrimPieces are the pieces that finish a V-neck or a collar edge.
func neckTrimPieces(vNeck bool, trim string, neckW, vDepth, collarEdge float64) []Piece {
	var out []Piece
	switch {
	case vNeck:
		length := 2*math.Hypot(neckW, vDepth) + 2.4*neckW + 2
		if trim == "contrast" {
			out = append(out, withQty(draftRectPiece("Neck trim", length, 3.5, "", ""), 1, "Cut 1 in the contrast fabric, on the bias: a binding sewn round the V and the back neck, showing 1.5cm on the outside."))
		} else {
			out = append(out, withQty(draftRectPiece("Neck facing", length, 4, "", ""), 2, "Cut 2 (facing and interfacing): sewn to the neckline and turned to the inside."))
		}
	case trim == "contrast":
		out = append(out, withQty(draftRectPiece("Piping strip", collarEdge, 3, "", ""), 1, "Cut 1 in the contrast fabric, on the bias: folded round piping cord and sewn along the collar's outer edge."))
	}
	return out
}

// MotifPlacements are the places a motif band can go, with the pattern piece
// each makes. "side" is the insert panel (see Panel), not listed here.
var MotifPlacements = []string{"centre", "double", "chest", "shoulder", "hem", "arms"}

// MotifPatterns are the fills a motif can have.
var MotifPatterns = []string{"solid", "stripes", "batik", "parang", "chevron", "dots", "check"}

var motifPatternNames = map[string]string{
	"solid": "plain contrast fabric", "stripes": "striped fabric", "batik": "batik (diamond) fabric", "parang": "parang (diagonal batik) fabric",
	"chevron": "chevron / tumpal fabric", "dots": "dotted fabric", "check": "checked fabric",
}

func motifMaterial(pattern string) string {
	if n, ok := motifPatternNames[pattern]; ok {
		return n
	}
	return motifPatternNames["solid"]
}

// pathStartY is the y of a path's first point.
func pathStartY(d string) float64 {
	poly := flattenPath(d)
	if len(poly) == 0 {
		return 0
	}
	return poly[0].y
}

// motifPieces are the strips for the motif bands asked for: laid over the
// finished garment (appliqué, ribbon or printed fabric tape) rather than cut
// into it, so the body pieces stay whole. Names avoid "front", "back",
// "sleeve", "collar" and "placket", which the preview reads as the main pieces.
func motifPieces(front, back, sleeve Piece, motifs []string, pattern string) []Piece {
	if len(motifs) == 0 {
		return nil
	}
	mat := motifMaterial(pattern)
	around := front.Width + back.Width // half the way round the body
	var out []Piece
	seen := map[string]bool{}
	for _, m := range motifs {
		if seen[m] {
			continue
		}
		seen[m] = true
		switch m {
		case "centre":
			length := round1(front.Height - pathStartY(front.PathData))
			out = append(out, withQty(draftRectPiece("Motif streak", 5.5, length, "", ""), 1,
				"Cut 1 in the "+mat+", 5cm wide when finished: a streak from the collar down the center front to the hem, laid over the placket (seam allowance included)."))
		case "double":
			length := round1(front.Height - pathStartY(front.PathData))
			out = append(out, withQty(draftRectPiece("Motif streak", 4, length, "", ""), 2,
				"Cut 2 in the "+mat+", 3.5cm wide when finished: two streaks from the shoulder to the hem, one each side of the center front (seam allowance included)."))
		case "chest":
			out = append(out, withQty(draftRectPiece("Chest band", round1(around), 8, "", ""), 2,
				"Cut 2 (one each side) in the "+mat+", 7cm high when finished: a band across the chest, joined at the side seams."))
		case "shoulder":
			out = append(out, withQty(draftRectPiece("Shoulder band", round1(around), 9, "", ""), 2,
				"Cut 2 in the "+mat+", 8cm deep when finished: a band across the top of the front and the upper back, cut to the neckline and shoulder shape."))
		case "hem":
			out = append(out, withQty(draftRectPiece("Hem band", round1(around), 9, "", ""), 2,
				"Cut 2 in the "+mat+", 8cm high when finished: a border round the bottom of the shirt, joined at the side seams."))
		case "arms":
			out = append(out, withQty(draftRectPiece("Arm motif band", round1(sleeve.Width*0.85), 6, "", ""), 2,
				"Cut 2 (one per arm) in the "+mat+", 5cm high when finished: a band round each arm, about a third of the way down."))
		}
	}
	return out
}
