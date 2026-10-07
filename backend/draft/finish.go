package draft

import (
	"math"
	"strconv"
	"strings"
)

// Finish turns a drafted block into a cuttable pattern piece: it adds
// the cutting line (the sewing line pushed out by seam and hem
// allowances) and a grainline. The blocks themselves stay allowance-
// free because that's the convention — every reference lists allowances
// as the LAST step, added "during pattern finalization" — and because
// the sleeve/armhole/side-seam truing is done on the sewing lines.
//
// Allowances, from the two references (the infographic's guide and the
// article): 1cm on ordinary seams, 0 on a fold, 2cm on a shirt or
// sleeve hem, 4cm on a trouser or skirt hem.
const (
	seamAllowance   = 1.0
	topHemAllowance = 2.0
	sleeveHemAllow  = 2.5
	longHemAllow    = 4.0
)

// FinishAll applies Finish to every piece.
func FinishAll(ps []Piece) []Piece {
	out := make([]Piece, len(ps))
	for i, p := range ps {
		out[i] = Finish(p)
		out[i].Qty = p.Qty
		if out[i].Qty == 0 {
			out[i].Qty = cutQty(p)
		}
		if out[i].CutFull && out[i].CutPathData != "" && out[i].Qty%2 == 0 {
			out[i].Qty /= 2 // halves counted as mirrored pairs become whole pieces
		}
	}
	return out
}

// cutQty is the number of copies of the piece, as drawn, that one
// garment needs. Every piece used to be sent to the cutting layout
// twice, which over-cut single pieces (collar stand, waistband) and
// under-cut repeated ones (belt loops).
func cutQty(p Piece) int {
	n := strings.ToLower(p.Name)
	per := 1 // full garments' worth of the finished piece
	switch {
	case strings.Contains(n, "sleeve rib"), n == "cuff", strings.Contains(n, "cuff slit"):
		per = 2 // one per sleeve
	case n == "sleeve", strings.HasPrefix(n, "pants"), strings.HasPrefix(n, "shorts"):
		per = 2 // sleeves and trouser legs come in pairs
	case n == "collar leaf", n == "collar stand", n == "standing collar", n == "yoke":
		per = 2 // outer + inner layer
	case n == "placket", n == "hidden placket", n == "waistband", strings.Contains(n, "welt strip"):
		per = 2 // two shirt front bands, band + facing, two pockets
	case n == "patch pocket":
		return 2 // one per back half
	case n == "belt loop":
		return 5
	case strings.Contains(n, "pocket bag"):
		return 4 // two pockets, two layers each
	}
	// A half drawn against a fold is cut as a mirrored pair.
	if p.FoldEdge == "left" || p.FoldEdge == "bottom" {
		return 2 * per
	}
	return per
}

func hemAllowanceFor(name string) float64 {
	n := strings.ToLower(name)
	switch {
	case strings.HasPrefix(n, "upper "):
		return seamAllowance // a colour block's lower edge is a seam, not a hem
	case strings.Contains(n, "pants"), strings.Contains(n, "shorts"), strings.Contains(n, "skirt"):
		return longHemAllow
	case n == "sleeve":
		return sleeveHemAllow
	case strings.Contains(n, "front"), strings.Contains(n, "back"):
		return topHemAllowance
	}
	return seamAllowance
}

// Finish returns p with CutPathData/CutWidth/CutHeight/CutOffset and
// Grainline set. Pieces whose path can't be parsed come back unchanged.
func Finish(p Piece) Piece {
	poly := flattenPath(p.PathData)
	if len(poly) < 3 {
		return p
	}
	minY, maxY := poly[0].y, poly[0].y
	for _, q := range poly {
		minY, maxY = math.Min(minY, q.y), math.Max(maxY, q.y)
	}
	hem, seam := hemAllowanceFor(p.Name), seamAllowance
	if p.HemAllow > 0 {
		hem = p.HemAllow
	}
	if p.SeamAllow > 0 {
		seam = p.SeamAllow
		if p.HemAllow == 0 && hem == seamAllowance {
			hem = seam // an edge that only counts as a seam
		}
	}
	if p.NoAllowance {
		hem, seam = 0, 0
	}
	// The fold is the piece's leftmost edge — at x = 0 for a plain half, but
	// further left when something is added at the fold (a back pleat).
	minX := poly[0].x
	for _, q := range poly {
		minX = math.Min(minX, q.x)
	}

	n := len(poly)
	allow := make([]float64, n) // allowance of edge i: poly[i] -> poly[i+1]
	for i := range allow {
		a, b := poly[i], poly[(i+1)%n]
		allow[i] = seam
		switch {
		case p.FoldEdge == "left" && math.Abs(a.x-minX) < 0.05 && math.Abs(b.x-minX) < 0.05:
			allow[i] = 0
		case p.FoldEdge == "bottom" && math.Abs(a.y-maxY) < 0.05 && math.Abs(b.y-maxY) < 0.05:
			allow[i] = 0
		case math.Abs(a.y-maxY) < 0.05 && math.Abs(b.y-maxY) < 0.05:
			allow[i] = hem
		}
	}
	// A hem isn't always level: a shirttail curves up to the side, and a hem
	// can sit a few millimetres off the bottom. The hem is the run of edges
	// either side of the piece's lowest point that stay within 60° of level;
	// the side seams it meets are steeper.
	if hem != seam && p.FoldEdge != "bottom" {
		low := 0
		for i, q := range poly {
			if q.y > poly[low].y {
				low = i
			}
		}
		level := func(i int) bool {
			a, b := poly[(i+n)%n], poly[(i+1+n)%n]
			return allow[(i+n)%n] != 0 && math.Abs(b.y-a.y) <= 1.732*math.Abs(b.x-a.x)
		}
		for i, k := low, 0; k < n && level(i); i, k = i+1, k+1 {
			allow[(i+n)%n] = hem
		}
		for i, k := low-1, 0; k < n && level(i); i, k = i-1, k+1 {
			allow[(i+n)%n] = hem
		}
	}

	area := 0.0
	for i := 0; i < n; i++ {
		a, b := poly[i], poly[(i+1)%n]
		area += a.x*b.y - b.x*a.y
	}
	sign := 1.0
	if area < 0 {
		sign = -1.0
	}
	normal := func(a, b point) point {
		dx, dy := b.x-a.x, b.y-a.y
		l := math.Hypot(dx, dy)
		if l == 0 {
			return point{}
		}
		return point{sign * dy / l, -sign * dx / l}
	}

	cut := make([]point, n)
	// The point where a mirrored hem corner's side turns outward, on the hem
	// line: added to the cutting line before (or after) that corner.
	foldBefore, foldAfter := map[int]point{}, map[int]point{}
	for i := 0; i < n; i++ {
		prev, cur, next := poly[(i+n-1)%n], poly[i], poly[(i+1)%n]
		n1, n2 := normal(prev, cur), normal(cur, next)
		d1, d2 := allow[(i+n-1)%n], allow[i]
		den := 1 + n1.x*n2.x + n1.y*n2.y
		if den < 0.25 { // a very sharp corner: cap the miter
			den = 0.25
		}
		cut[i] = point{cur.x + (d1*n1.x+d2*n2.x)/den, cur.y + (d1*n1.y+d2*n2.y)/den}
		// Where a hem meets a side seam at an angle (a straight hem on a
		// tapering sleeve), its allowance is the side seam mirrored in the
		// hem line, as if the paper were folded up along the hem and the side
		// traced: turned up, the allowance then lies flat against the side,
		// and the cut corner sticks out in a point. A hem square to its side
		// gets the same corner as before.
		if hem > seam && d1 != d2 && (d1 == hem || d2 == hem) && (d1 == seam || d2 == seam) {
			side, hemEdge := prev, next // the far ends of the two edges at this corner
			ns, nh := n1, n2
			if d1 == hem {
				side, hemEdge, ns, nh = next, prev, n2, n1
			}
			u := sub(side, cur) // up the side, away from the hem
			if l := math.Hypot(u.x, u.y); l > 0 {
				u = point{u.x / l, u.y / l}
			}
			h := sub(hemEdge, cur)
			if l := math.Hypot(h.x, h.y); l > 0 {
				h = point{h.x / l, h.y / l}
			}
			un := u.x*nh.x + u.y*nh.y
			if math.Abs(un) > 1e-6 {
				// Where the side's sewing line, moved out by its allowance,
				// crosses the hem line...
				t := -seam * (ns.x*nh.x + ns.y*nh.y) / un
				f := point{cur.x + ns.x*seam + t*u.x, cur.y + ns.y*seam + t*u.y}
				// ...the side carries on below the hem line as its mirror image.
				uh := u.x*h.x + u.y*h.y
				v := point{2*uh*h.x - u.x, 2*uh*h.y - u.y}
				if vn := v.x*nh.x + v.y*nh.y; vn > 1e-6 && math.Abs(uh) > 0.01 {
					cut[i] = point{f.x + v.x*hem/vn, f.y + v.y*hem/vn}
					if d1 == seam {
						foldBefore[i] = f
					} else {
						foldAfter[i] = f
					}
				}
			}
		}
	}

	withHemFolds := func() []point {
		if len(foldBefore)+len(foldAfter) == 0 {
			return cut
		}
		out := make([]point, 0, len(cut)+len(foldBefore)+len(foldAfter))
		for i, q := range cut {
			if f, ok := foldBefore[i]; ok {
				out = append(out, f)
			}
			out = append(out, q)
			if f, ok := foldAfter[i]; ok {
				out = append(out, f)
			}
		}
		return out
	}
	if !p.CutFull || p.FoldEdge != "left" {
		cut = withHemFolds()
	}
	if p.CutFull && p.FoldEdge == "left" {
		// Where a seam meets the fold at an angle, its allowance moves the
		// corner off the fold line: put it back on the line, where the
		// allowed edge crosses it, so the halves join cleanly.
		onFold := func(i int) bool {
			a, b := poly[(i+n)%n], poly[(i+1+n)%n]
			return math.Abs(a.x-minX) < 0.05 && math.Abs(b.x-minX) < 0.05
		}
		for i := 0; i < n; i++ {
			in, out := onFold(i-1), onFold(i)
			if in == out {
				continue
			}
			// The other edge at this corner: before it (in) or after it (out).
			j, k := (i+n-1)%n, i
			if in {
				j, k = i, (i+1)%n
			}
			d := allow[j]
			nn := normal(poly[j], poly[k])
			a := point{poly[j].x + d*nn.x, poly[j].y + d*nn.y}
			b := point{poly[k].x + d*nn.x, poly[k].y + d*nn.y}
			if math.Abs(b.x-a.x) > 1e-9 {
				t := (minX - a.x) / (b.x - a.x)
				cut[i] = point{minX, a.y + t*(b.y-a.y)}
			}
		}
		cut = withHemFolds()
		if full, ok := unfoldAt(cut, minX); ok {
			cut = full
		} else {
			p.CutFull = false
		}
	}

	minX, minCY := cut[0].x, cut[0].y
	maxX, maxCY := cut[0].x, cut[0].y
	for _, q := range cut {
		minX, minCY = math.Min(minX, q.x), math.Min(minCY, q.y)
		maxX, maxCY = math.Max(maxX, q.x), math.Max(maxCY, q.y)
	}
	pb := &pathBuilder{}
	for i, q := range cut {
		q = point{q.x - minX, q.y - minCY}
		if i == 0 {
			pb.moveTo(q)
		} else {
			pb.lineTo(q)
		}
	}
	pb.close()

	p.CutPathData = pb.String()
	p.CutWidth = round1(maxX - minX)
	p.CutHeight = round1(maxCY - minCY)
	p.CutOffset = &Point{X: round1(-minX), Y: round1(-minCY)}
	p.Grainline = grainlineFor(p, minY, maxY)
	if p.CutFull && p.Grainline != nil {
		// A whole piece's grainline runs down its centre line, or along its
		// whole length when it runs across.
		g := p.Grainline
		fold := poly[0].x
		for _, q := range poly {
			fold = math.Min(fold, q.x)
		}
		if math.Abs(g[0]-g[2]) < 0.01 {
			g[0], g[2] = fold, fold
		} else {
			g[0] = 2*fold - g[2]
		}
	}
	return p
}

// grainlineFor is the arrowed line every piece carries: parallel to
// center front/back (or the sleeve's / leg's own straight edge), long
// strips along their length.
func grainlineFor(p Piece, minY, maxY float64) *[4]float64 {
	h := maxY - minY
	switch {
	case p.Crown != nil:
		return &[4]float64{p.Crown.X, minY + h*0.22, p.Crown.X, minY + h*0.9}
	case p.Landmarks != nil && p.Landmarks["hemInseam"].Y > 0:
		x := (p.Landmarks["hemInseam"].X + p.Landmarks["hemSide"].X) / 2
		return &[4]float64{x, minY + h*0.3, x, minY + h*0.92}
	case p.Width > 2*p.Height:
		y := minY + h/2
		return &[4]float64{p.Width * 0.12, y, p.Width * 0.88, y}
	case p.Height > 3*p.Width:
		x := p.Width / 2
		return &[4]float64{x, minY + h*0.1, x, minY + h*0.9}
	}
	x := p.Width * 0.42
	return &[4]float64{x, minY + h*0.25, x, minY + h*0.85}
}

// flattenPath turns an M/L/C/Z path into a closed polygon, sampling
// each cubic bezier.
func flattenPath(d string) []point {
	toks := strings.Fields(strings.NewReplacer("M", " M ", "L", " L ", "C", " C ", "Z", " Z ", ",", " ").Replace(d))
	var out []point
	var cur point
	i := 0
	num := func() float64 {
		v, _ := strconv.ParseFloat(toks[i], 64)
		i++
		return v
	}
	for i < len(toks) {
		cmd := toks[i]
		i++
		switch cmd {
		case "M", "L":
			cur = point{num(), num()}
			out = append(out, cur)
		case "C":
			c1 := point{num(), num()}
			c2 := point{num(), num()}
			e := point{num(), num()}
			const steps = 14
			for s := 1; s <= steps; s++ {
				t := float64(s) / steps
				u := 1 - t
				out = append(out, point{
					u*u*u*cur.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*e.x,
					u*u*u*cur.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*e.y,
				})
			}
			cur = e
		}
	}
	// drop the duplicate closing point and any zero-length repeats
	var clean []point
	for _, q := range out {
		if len(clean) == 0 || math.Hypot(q.x-clean[len(clean)-1].x, q.y-clean[len(clean)-1].y) > 1e-6 {
			clean = append(clean, q)
		}
	}
	if len(clean) > 1 && math.Hypot(clean[0].x-clean[len(clean)-1].x, clean[0].y-clean[len(clean)-1].y) < 1e-6 {
		clean = clean[:len(clean)-1]
	}
	return clean
}

// unfoldAt turns a closed half outline whose straight fold edge lies on
// x = foldX into the whole outline: the half from one end of the fold edge
// round to the other, then its mirror image back, with no line where the
// fold was.
func unfoldAt(half []point, foldX float64) ([]point, bool) {
	n := len(half)
	on := func(i int) bool { return math.Abs(half[(i+n)%n].x-foldX) < 0.05 }
	// Where the outline leaves the fold edge.
	start := -1
	for i := 0; i < n; i++ {
		if on(i) && !on(i+1) {
			start = i
			break
		}
	}
	if start < 0 {
		return nil, false
	}
	path := []point{half[start]}
	for k := 1; k < n; k++ {
		q := half[(start+k)%n]
		path = append(path, q)
		if on(start + k) {
			break
		}
	}
	if len(path) < 3 || math.Abs(path[len(path)-1].x-foldX) > 0.05 {
		return nil, false
	}
	full := append([]point{}, path...)
	for i := len(path) - 2; i >= 1; i-- {
		full = append(full, point{2*foldX - path[i].x, path[i].y})
	}
	return full, true
}
