package draft

import "math"

// Colour blocking: the top of the shirt cut from a second fabric, the most
// common design move on Indonesian konveksi uniform boards (a contrast
// "shoulder yoke" front and back, straight across or dipping to a V at centre
// front). It is pieced, not appliquéd: the front is cut in two along the block
// line and joined with a seam, so each part is cut from its own fabric.

// colorBlockDepth is where the block line meets the armhole: this fraction of
// the way from the shoulder tip down to the underarm.
const colorBlockDepth = 0.45

// colorBlockV is how much lower the line sits at centre front for a V block (cm).
const colorBlockV = 9.0

// splitColorBlock cuts a body panel (front or back, drawn with its neck point
// at y = 0 and its centre line at x = 0) along the block line. It returns the
// upper part (cut in the contrast fabric) and the lower part, which keeps the
// panel's name and, in Outline, the whole panel's outline for drawings. dip is
// how much lower the line is at the centre line than at the armhole.
func splitColorBlock(p Piece, dip float64, upperName string) (upper, lower Piece, ok bool) {
	poly := flattenPath(p.PathData)
	if len(poly) < 3 || p.ShoulderTip == nil {
		return p, p, false
	}
	// The underarm: the widest point of the panel below the shoulder.
	tip := point{p.ShoulderTip.X, p.ShoulderTip.Y}
	under := tip
	for _, q := range poly {
		if q.y > tip.y && q.x > under.x {
			under = q
		}
	}
	armY := tip.y + (under.y-tip.y)*colorBlockDepth
	cfY := armY + dip
	// Stay clear of the neckline at centre front.
	neckY := 0.0
	for _, q := range poly {
		if math.Abs(q.x) < 0.05 {
			if neckY == 0 || q.y < neckY {
				neckY = q.y
			}
		}
	}
	if cfY < neckY+3 {
		cfY = neckY + 3
		if dip == 0 {
			armY = cfY // a straight block stays level, just lower
		}
	}
	line := func(x float64) float64 { return cfY + (armY-cfY)*x/under.x }
	cross := func(a, b point) point {
		// Where segment a-b meets the line y = line(x).
		fa, fb := a.y-line(a.x), b.y-line(b.x)
		t := fa / (fa - fb)
		return point{a.x + (b.x-a.x)*t, a.y + (b.y-a.y)*t}
	}
	clip := func(inside func(point) bool) []point {
		var out []point
		for i := range poly {
			a, b := poly[i], poly[(i+1)%len(poly)]
			switch {
			case inside(a) && inside(b):
				out = append(out, b)
			case inside(a):
				out = append(out, cross(a, b))
			case inside(b):
				out = append(out, cross(a, b), b)
			}
		}
		return out
	}
	top := clip(func(q point) bool { return q.y <= line(q.x) })
	bottom := clip(func(q point) bool { return q.y >= line(q.x) })
	if len(top) < 3 || len(bottom) < 3 {
		return p, p, false
	}
	marks := map[string]Point{"blockCF": {X: 0, Y: round1(cfY)}, "blockArm": {X: round1(under.x), Y: round1(armY)}}

	upper = polyPiece(upperName, top)
	upper.FoldEdge, upper.Qty = p.FoldEdge, p.Qty
	upper.Fabric = "contrast"
	for k, v := range marks {
		upper.Landmarks[k] = v
	}

	lower = polyPiece(p.Name, bottom)
	lower.FoldEdge, lower.Qty, lower.Notes = p.FoldEdge, p.Qty, p.Notes
	lower.Fabric = p.Fabric
	lower.Outline = p.PathData
	lower.ShoulderTip = p.ShoulderTip
	for k, v := range p.Landmarks {
		lower.Landmarks[k] = v
	}
	for k, v := range marks {
		lower.Landmarks[k] = v
	}
	return upper, lower, true
}

// colorBlock applies a colour block to a shirt's pieces (front first).
func colorBlock(pieces []Piece, back Piece, style string) []Piece {
	dip := 0.0
	if style == "v" {
		dip = colorBlockV
	}
	// pieces[0] is the front as it will be cut (a button front is a left and
	// right pair, not a half on the fold), which the parts must follow.
	if upper, lower, ok := splitColorBlock(pieces[0], dip, "Upper front"); ok {
		upper.Notes = "Cut in the contrast fabric, like the front: the colour block across the top of the front. Joined to the front along the block line (1cm seam), topstitched."
		lower.Notes += " The top is the colour block line: joined to the upper front there."
		pieces[0] = lower
		pieces = append(pieces, upper)
	}
	for i := range pieces {
		if pieces[i].Name == "Yoke" {
			// The back's own yoke is the block at the back.
			pieces[i].Fabric = "contrast"
			pieces[i].Notes += " Cut in the contrast fabric: the colour block at the back."
			return pieces
		}
	}
	for i := range pieces {
		if pieces[i].Name == back.Name && pieces[i].PathData == back.PathData {
			if upper, lower, ok := splitColorBlock(back, 0, "Upper back"); ok {
				upper.Notes = "Cut in the contrast fabric, like the back: the colour block across the top of the back, level with the front's at the armhole."
				lower.Notes += " The top is the colour block line: joined to the upper back there."
				pieces[i] = lower
				pieces = append(pieces, upper)
			}
			break
		}
	}
	return pieces
}
