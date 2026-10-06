package draft

import (
	"math"
	"strconv"
	"strings"
)

// seg is one edge of an outline, from the previous edge's end to p: a
// straight line, or a cubic bezier with controls c1, c2.
type seg struct {
	curve  bool
	c1, c2 point
	p      point
}

// outline is a closed sewing line kept as lines and curves, so it can be
// turned (a dart moved), split (a yoke seam) or trimmed (a placket seam)
// without losing its curves the way a flattened polygon would.
type outline struct {
	start point
	segs  []seg
}

func (o *outline) lineTo(p point) *outline {
	o.segs = append(o.segs, seg{p: p})
	return o
}

func (o *outline) curveTo(c1, c2, p point) *outline {
	o.segs = append(o.segs, seg{curve: true, c1: c1, c2: c2, p: p})
	return o
}

func (o *outline) add(ss ...seg) *outline {
	o.segs = append(o.segs, ss...)
	return o
}

// end is where the outline currently stops.
func (o outline) end() point {
	if len(o.segs) == 0 {
		return o.start
	}
	return o.segs[len(o.segs)-1].p
}

// path writes the outline as SVG path data, rounded to 1mm like every
// other drafted piece, and closed.
func (o outline) path() string {
	pb := &pathBuilder{}
	r := func(p point) point { return point{round1(p.x), round1(p.y)} }
	pb.moveTo(r(o.start))
	for _, s := range o.segs {
		if s.curve {
			pb.curveTo(r(s.c1), r(s.c2), r(s.p))
		} else {
			pb.lineTo(r(s.p))
		}
	}
	pb.close()
	return pb.String()
}

// segLength is the length of s drawn from a.
func segLength(a point, s seg) float64 {
	if s.curve {
		return cubicLength(a, s.c1, s.c2, s.p)
	}
	return math.Hypot(s.p.x-a.x, s.p.y-a.y)
}

// lengthOf is the total length of consecutive segments drawn from a.
func lengthOf(a point, ss []seg) float64 {
	total := 0.0
	for _, s := range ss {
		total += segLength(a, s)
		a = s.p
	}
	return total
}

// rotated turns a segment about centre by angle (radians, y down, so a
// positive angle turns clockwise on screen).
func (s seg) rotated(centre point, angle float64) seg {
	r := func(p point) point { return add(centre, rotate(sub(p, centre), angle)) }
	return seg{curve: s.curve, c1: r(s.c1), c2: r(s.c2), p: r(s.p)}
}

// splitSeg cuts s (drawn from a) at parameter t into two segments.
func splitSeg(a point, s seg, t float64) (seg, seg) {
	if !s.curve {
		m := lerp(a, s.p, t)
		return seg{p: m}, seg{p: s.p}
	}
	c1, d, f, e, c := splitCubic(a, s.c1, s.c2, s.p, t)
	return seg{curve: true, c1: c1, c2: d, p: f}, seg{curve: true, c1: e, c2: c, p: s.p}
}

// pointAt is the point at parameter t along s drawn from a.
func pointAt(a point, s seg, t float64) point {
	if !s.curve {
		return lerp(a, s.p, t)
	}
	_, _, f, _, _ := splitCubic(a, s.c1, s.c2, s.p, t)
	return f
}

// crossT finds where s (drawn from a) crosses the line where coord(p) = v,
// if it does, assuming it crosses at most once.
func crossT(a point, s seg, coord func(point) float64, v float64) (float64, bool) {
	const n = 48
	prev := coord(a) - v
	for i := 1; i <= n; i++ {
		t := float64(i) / n
		cur := coord(pointAt(a, s, t)) - v
		if (prev < 0) != (cur < 0) {
			lo, hi := float64(i-1)/n, t
			for k := 0; k < 30; k++ {
				mid := (lo + hi) / 2
				if (coord(pointAt(a, s, mid))-v < 0) == (prev < 0) {
					lo = mid
				} else {
					hi = mid
				}
			}
			return (lo + hi) / 2, true
		}
		prev = cur
	}
	return 0, false
}

// extendLeft moves the straight edge the outline runs along x = 0 (centre
// front) out to x = -ext, joining it back to the neckline and the hem with
// short level lines: how a front's button extension (lidah) is drawn on
// beyond centre front. It returns the new edge's length, or false when the
// outline has no straight edge on x = 0.
func (o outline) extendLeft(ext float64) (outline, float64, bool) {
	if dist2(o.end(), o.start) > 1e-4 { // count the edge the close draws, too
		o.segs = append(append([]seg{}, o.segs...), seg{p: o.start})
	}
	onCF := func(p point) bool { return math.Abs(p.x) < 0.05 }
	n := len(o.segs)
	from := func(o outline, i int) point {
		if i == 0 {
			return o.start
		}
		return o.segs[i-1].p
	}
	isEdge := func(o outline, i int) bool {
		return !o.segs[i].curve && onCF(from(o, i)) && onCF(o.segs[i].p)
	}
	// Start just after an edge that isn't on centre front, so the run along
	// it doesn't wrap round the start.
	k := -1
	for i := range o.segs {
		if !isEdge(o, i) {
			k = i
			break
		}
	}
	if k < 0 {
		return o, 0, false
	}
	r := outline{start: o.segs[k].p}
	r.add(o.segs[k+1:]...).add(o.segs[:k+1]...)
	first := -1
	for i := 0; i < n; i++ {
		if isEdge(r, i) {
			first = i
			break
		}
	}
	if first < 0 {
		return o, 0, false
	}
	last := first
	for last+1 < n && isEdge(r, last+1) {
		last++
	}
	top, bottom := from(r, first), r.segs[last].p
	out := outline{start: r.start}
	out.add(r.segs[:first]...)
	out.lineTo(point{-ext, top.y}).lineTo(point{-ext, bottom.y}).lineTo(bottom)
	out.add(r.segs[last+1:]...)
	return out, math.Abs(bottom.y - top.y), true
}

// parseOutline reads the M/L/C/Z path data this package writes.
func parseOutline(d string) (outline, bool) {
	toks := strings.Fields(strings.NewReplacer("M", " M ", "L", " L ", "C", " C ", "Z", " Z ", ",", " ").Replace(d))
	var o outline
	i := 0
	num := func() float64 {
		if i >= len(toks) {
			return 0
		}
		v, _ := strconv.ParseFloat(toks[i], 64)
		i++
		return v
	}
	started := false
	for i < len(toks) {
		cmd := toks[i]
		i++
		switch cmd {
		case "M":
			o.start = point{num(), num()}
			started = true
		case "L":
			o.lineTo(point{num(), num()})
		case "C":
			c1 := point{num(), num()}
			c2 := point{num(), num()}
			o.curveTo(c1, c2, point{num(), num()})
		}
	}
	// Drop a closing edge back onto the start: close() draws it.
	if n := len(o.segs); n > 0 && !o.segs[n-1].curve && dist2(o.segs[n-1].p, o.start) < 1e-4 {
		o.segs = o.segs[:n-1]
	}
	return o, started && len(o.segs) >= 2
}

func dist2(a, b point) float64 { return (a.x-b.x)*(a.x-b.x) + (a.y-b.y)*(a.y-b.y) }

func unit(v point) point {
	l := math.Hypot(v.x, v.y)
	if l == 0 {
		return point{}
	}
	return point{v.x / l, v.y / l}
}

// ARMHOLE. Every block system draws the armhole the same way: it leaves
// the shoulder square to the shoulder seam, runs down fairly straight to
// the across-chest (front) or across-back line, then scoops out to the
// side seam, which it meets square — so that front and back, sewn at the
// shoulder and the side, make one smooth round opening with no peak at the
// shoulder and no point under the arm (Aldrich, Metric Pattern Cutting;
// the So-en and kemeja-pria drafts construct it the same way, through the
// "lebar muka/lebar punggung" point and a guide measured on the diagonal
// from the underarm corner).
//
// The earlier armhole was one curve whose second control sat outside the
// side seam, so it ran into the side seam almost straight (about 190°)
// instead of turning under the arm, and left the shoulder at about 140°.
const (
	// How far the across-chest/across-back line sits in from the shoulder
	// point, and how far down the armhole: 1cm in at half the depth, front
	// and back alike (jarumjahit "Pola Dasar Kemeja Pria": "O–P = ½ (E1–O);
	// P–P1 = kiri 1cm", and the same 1cm at the back, "X–X1 = 1cm").
	frontAcrossInset = 1.0
	backAcrossInset  = 1.0
	frontAcrossLevel = 0.5
	backAcrossLevel  = 0.5
	// How closely the scoop under the arm follows the underarm corner: it
	// passes 3.5-4cm in from the corner on the diagonal. Set so the armholes
	// come out the length the reference sleeves fit: the boys' size-8
	// chart's 26.5cm sleeve with an 8cm cap, and an adult shirt's wide sleeve
	// with a cap of 11-12cm.
	frontScoop = 0.5
	backScoop  = 0.45
)

// draftArmhole returns the armhole from the shoulder point down to the
// underarm as two curves. neckPoint gives the shoulder seam's direction and
// sideTo the next point down the side seam, which the armhole meets square.
func draftArmhole(neckPoint, shoulderTip, underarm, sideTo point, back bool) []seg {
	inset, level, scoop := frontAcrossInset, frontAcrossLevel, frontScoop
	if back {
		inset, level, scoop = backAcrossInset, backAcrossLevel, backScoop
	}
	// The inset is jarumjahit's 1cm on an adult's 15cm shoulder; a child's
	// shorter shoulder is hollowed proportionally less.
	inset *= math.Min(1, math.Hypot(shoulderTip.x-neckPoint.x, shoulderTip.y-neckPoint.y)/15)
	return shapedArmhole(neckPoint, shoulderTip, underarm, sideTo, inset, 2.5, level, scoop)
}

// shapedArmhole draws the armhole through an across point inset in from the
// shoulder tip (and at least underIn in from the underarm), level of the way
// down, scooping under the arm by scoop.
func shapedArmhole(neckPoint, shoulderTip, underarm, sideTo point, inset, underIn, level, scoop float64) []seg {
	depth := underarm.y - shoulderTip.y
	acrossX := math.Min(shoulderTip.x-inset, underarm.x-underIn)
	across := point{acrossX, shoulderTip.y + depth*level}

	// Square off the shoulder: the perpendicular to the seam, pointing down.
	u := unit(sub(shoulderTip, neckPoint))
	down := point{-u.y, u.x}
	if down.y < 0 {
		down = scale(down, -1)
	}
	upper := seg{
		curve: true,
		c1:    add(shoulderTip, scale(down, (across.y-shoulderTip.y)*0.45)),
		c2:    point{across.x, across.y - (across.y-shoulderTip.y)*0.35},
		p:     across,
	}
	side := unit(sub(sideTo, underarm))
	in := point{-side.y, side.x} // square to the side seam, pointing in
	if in.x > 0 {
		in = scale(in, -1)
	}
	lower := seg{
		curve: true,
		c1:    point{across.x, across.y + (underarm.y-across.y)*scoop},
		c2:    add(underarm, scale(in, (underarm.x-across.x)*scoop)),
		p:     underarm,
	}
	return []seg{upper, lower}
}

// splitAtY cuts consecutive segments drawn from a where they cross the
// height y (a yoke seam across the armhole), returning the part above,
// the part below and the point where they meet.
func splitAtY(a point, ss []seg, y float64) (above, below []seg, at point) {
	getY := func(p point) float64 { return p.y }
	for i, s := range ss {
		if t, ok := crossT(a, s, getY, y); ok {
			h, tl := splitSeg(a, s, t)
			if i > 0 && segLength(a, h) < 0.3 {
				// The seam falls just past a joint: end the segment before at
				// the seam rather than leave a millimetre sliver of curve.
				above = append([]seg{}, ss[:i]...)
				above[i-1].p = h.p
				above[i-1].c2 = add(above[i-1].c2, sub(h.p, a))
				return above, append([]seg{tl}, ss[i+1:]...), h.p
			}
			above = append(append([]seg{}, ss[:i]...), h)
			below = append([]seg{tl}, ss[i+1:]...)
			return above, below, h.p
		}
		a = s.p
	}
	return ss, nil, a
}
