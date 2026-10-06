package draft

import (
	"fmt"
	"math"
	"strings"
)

// Summary is what a pattern maker reads off one drafted size before it is
// cut: the finished garment's measurements (ukuran jadi — what a konveksi
// size chart lists and a customer's garment is checked against) and the
// checks that the pieces sew together.
type Summary struct {
	Finished []Finished `json:"finished"`
	Checks   []Check    `json:"checks"`
}

// Finished is one finished measurement, in cm.
type Finished struct {
	Key   string  `json:"key"`
	Label string  `json:"label"`
	Local string  `json:"local"` // its Indonesian name, as the cutting room says it
	CM    float64 `json:"cm"`
}

// Check is one thing the pattern has to get right to be sewable.
type Check struct {
	Label  string `json:"label"`
	OK     bool   `json:"ok"`
	Detail string `json:"detail"`
}

// Summarize measures and checks one size's finished pieces. m is the size's
// body measurements (for checks like "the hem goes over the hip").
func Summarize(ps []Piece, m Measurements) Summary {
	hipGiven := m.Hip > 0
	m = m.withDefaults()
	if !hipGiven {
		m.Hip = 0 // nothing to check the hem against
	}
	byName := func(names ...string) *Piece {
		for _, n := range names {
			for i := range ps {
				if ps[i].Name == n {
					return &ps[i]
				}
			}
		}
		return nil
	}
	if f, b := byName("Pants front", "Shorts front"), byName("Pants back", "Shorts back"); f != nil && b != nil {
		return summarizeTrousers(*f, *b, byName("Waistband"))
	}
	if f, b := byName("Skirt front"), byName("Skirt back"); f != nil && b != nil {
		return summarizeSkirt(*f, *b)
	}
	front := byName("Shirt front", "Bodice front")
	back := byName("Shirt back", "Bodice back")
	if front == nil || back == nil || front.Landmarks["underarm"] == (Point{}) || back.Landmarks["underarm"] == (Point{}) {
		return Summary{}
	}
	return summarizeShirt(*front, *back, byName("Yoke"), byName("Sleeve"), byName("Cuff"), byName("Placket", "Hidden placket"), m)
}

func lmPoint(p Piece, k string) (point, bool) {
	v, ok := p.Landmarks[k]
	return point{v.X, v.Y}, ok
}

// drawnOutline is a panel's whole outline: Outline when the cut piece was
// split or extended, else its sewing line.
func drawnOutline(p Piece) (outline, bool) {
	if p.Outline != "" {
		return parseOutline(p.Outline)
	}
	return parseOutline(p.PathData)
}

// closed returns the outline with the edge its close draws made explicit.
func (o outline) closed() outline {
	if dist2(o.end(), o.start) > 1e-4 {
		o.segs = append(append([]seg{}, o.segs...), seg{p: o.start})
	}
	return o
}

// seamBetween is the length of the outline from one of its points to
// another, following its direction.
func seamBetween(o outline, from, to point) (float64, bool) {
	o = o.closed()
	n := len(o.segs)
	start := -1
	if dist2(o.start, from) < 0.02 {
		start = 0
	}
	for i := 0; start < 0 && i < n; i++ {
		if dist2(o.segs[i].p, from) < 0.02 {
			start = i + 1
		}
	}
	if start < 0 {
		return 0, false
	}
	total := 0.0
	a := from
	for k := 0; k < n; k++ {
		s := o.segs[(start+k)%n]
		total += segLength(a, s)
		if dist2(s.p, to) < 0.02 {
			return total, true
		}
		a = s.p
	}
	return 0, false
}

// cornerAngle is the angle (degrees) inside the outline at the point at.
func cornerAngle(o outline, at point) (float64, bool) {
	o = o.closed()
	n := len(o.segs)
	from := func(i int) point {
		if i == 0 {
			return o.start
		}
		return o.segs[i-1].p
	}
	for i, s := range o.segs {
		if dist2(s.p, at) >= 0.02 {
			continue
		}
		in := sub(s.p, from(i))
		if s.curve && dist2(s.p, s.c2) > 1e-6 {
			in = sub(s.p, s.c2)
		}
		next := o.segs[(i+1)%n]
		out := sub(next.p, s.p)
		if next.curve && dist2(next.c1, s.p) > 1e-6 {
			out = sub(next.c1, s.p)
		}
		cos := -dot(in, out) / math.Hypot(in.x, in.y) / math.Hypot(out.x, out.y)
		return math.Acos(clamp(cos, -1, 1)) * 180 / math.Pi, true
	}
	return 0, false
}

func finished(key, label, local string, cm float64) Finished {
	return Finished{Key: key, Label: label, Local: local, CM: round1(cm)}
}

// seamsMatch checks two seams that are sewn together are the same length.
func seamsMatch(label string, a, b float64, okA, okB bool, tol float64) Check {
	if !okA || !okB {
		return Check{Label: label, OK: false, Detail: "couldn't measure"}
	}
	return Check{Label: label, OK: math.Abs(a-b) <= tol, Detail: fmt.Sprintf("%.1f and %.1f cm", a, b)}
}

// squareCorners checks seams meet square where they join.
func squareCorners(label string, angles ...float64) Check {
	worst := 0.0
	parts := make([]string, 0, len(angles))
	for _, a := range angles {
		worst = math.Max(worst, math.Abs(a-90))
		parts = append(parts, fmt.Sprintf("%.0f°", a))
	}
	return Check{Label: label, OK: worst <= 5, Detail: strings.Join(parts, ", ")}
}

func summarizeShirt(front, back Piece, yoke, sleeve, cuff, placket *Piece, m Measurements) Summary {
	var s Summary
	fo, okF := drawnOutline(front)
	bo, okB := drawnOutline(back)
	if !okF || !okB {
		return s
	}
	top := back // the back's shoulder is on the yoke when there is one
	if yoke != nil {
		top = *yoke
	}
	fUnder, _ := lmPoint(front, "underarm")
	bUnder, _ := lmPoint(back, "underarm")
	fHem, _ := lmPoint(front, "hemSide")
	bHem, _ := lmPoint(back, "hemSide")
	fTip, _ := lmPoint(front, "shoulderTip")
	tTip, _ := lmPoint(top, "shoulderTip")
	fNeck, _ := lmPoint(front, "neckPoint")
	tNeck, _ := lmPoint(top, "neckPoint")

	chest := 2 * (fUnder.x + bUnder.x)
	hem := 2 * (fHem.x + bHem.x)
	s.Finished = append(s.Finished,
		finished("chest", "Chest", "Lingkar dada", chest),
		finished("hem", "Hem", "Lingkar bawah", hem),
		finished("length", "Length, shoulder to hem", "Panjang baju", back.Landmarks["hemCentre"].Y),
		finished("shoulder", "Shoulder width", "Lebar bahu", 2*tTip.x),
	)
	var armhole float64
	fArm, okFA := seamBetween(fo, fTip, fUnder)
	var bArm float64
	okBA := false
	if yoke != nil {
		yo, okY := parseOutline(yoke.PathData)
		ya, _ := lmPoint(*yoke, "yokeArm")
		a1, ok1 := seamBetween(yo, tTip, ya)
		a2, ok2 := seamBetween(bo, ya, bUnder)
		bArm, okBA = a1+a2, okY && ok1 && ok2
	} else {
		bArm, okBA = seamBetween(bo, tTip, bUnder)
	}
	armhole = fArm + bArm
	if sleeve != nil {
		so, ok := parseOutline(sleeve.PathData)
		if ok && len(so.segs) >= 5 {
			n := len(so.segs)
			cap := segLength(so.start, so.segs[0]) + segLength(so.segs[n-2].p, so.segs[n-1])
			length := sleeve.Height
			if so.segs[2].curve {
				length = pointAt(so.segs[1].p, so.segs[2], 0.5).y // the hem is an arc: its middle
			}
			if cuff != nil {
				length += cuff.Height
			}
			bicep := sleeve.Landmarks["frontUnderarm"].X - sleeve.Landmarks["backUnderarm"].X
			s.Finished = append(s.Finished,
				finished("sleeve", "Sleeve length", "Panjang lengan", length),
				finished("bicep", "Sleeve width", "Lingkar lengan", bicep),
			)
			if cuff != nil {
				s.Finished = append(s.Finished, finished("cuff", "Cuff, buttoned", "Lingkar manset", cuff.Width-2))
			} else {
				s.Finished = append(s.Finished, finished("opening", "Sleeve opening", "Lingkar ujung lengan", sleeve.Landmarks["frontWrist"].X-sleeve.Landmarks["backWrist"].X))
			}
			if okFA && okBA {
				ease := cap - armhole
				s.Checks = append(s.Checks, Check{
					Label:  "Sleeve cap fits the armhole",
					OK:     ease >= 0 && ease <= 3,
					Detail: fmt.Sprintf("cap %.1f cm on a %.1f cm armhole: %.1f cm eased in", cap, armhole, ease),
				})
			}
			if a1, ok1 := cornerAngle(so, point{sleeve.Landmarks["backUnderarm"].X, sleeve.Landmarks["backUnderarm"].Y}); ok1 {
				a2, _ := cornerAngle(so, point{sleeve.Landmarks["backWrist"].X, sleeve.Landmarks["backWrist"].Y})
				s.Checks = append(s.Checks, squareCorners("Sleeve meets its underarm seam square (cap, hem)", a1, a2))
			}
		}
	}

	fs, bs := distance(fNeck, fTip), distance(tNeck, tTip)
	s.Checks = append(s.Checks, Check{
		Label:  "Shoulder seams: back eased onto front",
		OK:     bs-fs >= 0.3 && bs-fs <= 1.5,
		Detail: fmt.Sprintf("back %.1f cm, front %.1f cm: %.1f cm eased in", bs, fs, bs-fs),
	})
	fSide, okFS := seamBetween(fo, fUnder, fHem)
	bSide, okBS := seamBetween(bo, bUnder, bHem)
	s.Checks = append(s.Checks, seamsMatch("Side seams the same length", fSide, bSide, okFS, okBS, 0.4))
	// A cuffed (3/4 or long) sleeve is drafted from the arm, shoulder to
	// wrist. A short sleeve's own length entered instead leaves a stub.
	if cuff != nil && m.SleeveLength > 0 && m.SleeveLength <= MaxShortSleeve {
		s.Checks = append(s.Checks, Check{
			Label:  "Sleeve length measured to the wrist",
			OK:     false,
			Detail: fmt.Sprintf("%.0f cm is a short sleeve's length: for 3/4 and long sleeves, measure from the shoulder to the wrist", m.SleeveLength),
		})
	}

	var angles []float64
	for _, c := range []struct {
		o  outline
		at point
	}{{fo, fTip}, {fo, fUnder}, {bo, bUnder}, {fo, fHem}, {bo, bHem}} {
		if a, ok := cornerAngle(c.o, c.at); ok {
			angles = append(angles, a)
		}
	}
	if len(angles) > 0 {
		s.Checks = append(s.Checks, squareCorners("Seams meet square (shoulder, underarm, hem)", angles...))
	}
	if m.Hip > 0 {
		s.Checks = append(s.Checks, Check{
			Label:  "Hem goes over the hip",
			OK:     hem >= m.Hip,
			Detail: fmt.Sprintf("hem %.0f cm, hip %.0f cm", hem, m.Hip),
		})
	}
	if placket != nil {
		if o, ok := parseOutline(front.PathData); ok {
			if _, edge, ok := frontEdgeOf(o); ok {
				s.Checks = append(s.Checks, seamsMatch("Placket runs the front edge", placket.Height, edge, true, true, 0.5))
			}
		}
	}
	for _, p := range []Piece{front, back} {
		for _, d := range p.Darts {
			if len(d) != 3 {
				continue
			}
			l1 := distance(point{d[0].X, d[0].Y}, point{d[1].X, d[1].Y})
			l2 := distance(point{d[2].X, d[2].Y}, point{d[1].X, d[1].Y})
			s.Checks = append(s.Checks, seamsMatch("Dart legs the same length ("+strings.ToLower(p.Name)+")", l1, l2, true, true, 0.2))
		}
	}
	return s
}

// frontEdgeOf finds a front's straight edge past centre front (its button
// extension): the run along the outline's smallest x.
func frontEdgeOf(o outline) (x, length float64, ok bool) {
	o = o.closed()
	minX := o.start.x
	for _, s := range o.segs {
		minX = math.Min(minX, s.p.x)
	}
	if minX > -0.05 {
		return 0, 0, false
	}
	a := o.start
	for _, s := range o.segs {
		if !s.curve && math.Abs(a.x-minX) < 0.05 && math.Abs(s.p.x-minX) < 0.05 {
			return minX, math.Abs(s.p.y - a.y), true
		}
		a = s.p
	}
	return 0, 0, false
}

func summarizeTrousers(front, back Piece, band *Piece) Summary {
	var s Summary
	fo, okF := parseOutline(front.PathData)
	bo, okB := parseOutline(back.PathData)
	if !okF || !okB {
		return s
	}
	lf := func(p Piece, k string) point { q, _ := lmPoint(p, k); return q }
	hip := 2 * ((lf(front, "hipSide").x - lf(front, "centerLine").x) + (lf(back, "hipSide").x - lf(back, "centerLine").x))
	opening := (lf(front, "hemSide").x - lf(front, "hemInseam").x) + (lf(back, "hemSide").x - lf(back, "hemInseam").x)
	inF, okIF := seamBetween(fo, lf(front, "crotchPt"), lf(front, "hemInseam"))
	inB, okIB := seamBetween(bo, lf(back, "crotchPt"), lf(back, "hemInseam"))
	sideF, okSF := seamBetween(fo, lf(front, "hemSide"), lf(front, "waistSide"))
	sideB, okSB := seamBetween(bo, lf(back, "hemSide"), lf(back, "waistSide"))
	if band != nil {
		s.Finished = append(s.Finished, finished("waist", "Waist (band, less overlap)", "Lingkar pinggang", band.Width-4))
	}
	s.Finished = append(s.Finished,
		finished("hip", "Hip", "Lingkar panggul", hip),
		finished("rise", "Front rise", "Pesak depan", lf(front, "crotchPt").y),
		finished("inseam", "Inseam", "Panjang dalam", inF),
		finished("length", "Side length", "Panjang celana", sideF),
		finished("opening", "Leg opening", "Lingkar kaki", opening),
	)
	s.Checks = append(s.Checks,
		seamsMatch("Inseams the same length", inF, inB, okIF, okIB, 0.4),
		seamsMatch("Side seams the same length", sideF, sideB, okSF, okSB, 0.4),
	)
	var angles []float64
	for _, c := range []struct {
		o  outline
		at point
	}{{fo, lf(front, "waistSide")}, {bo, lf(back, "waistSide")}, {fo, lf(front, "waistCF")}, {bo, lf(back, "waistCF")}} {
		if a, ok := cornerAngle(c.o, c.at); ok {
			angles = append(angles, a)
		}
	}
	if len(angles) > 0 {
		s.Checks = append(s.Checks, squareCorners("Waist meets the side and centre seams square", angles...))
	}
	return s
}

func summarizeSkirt(front, back Piece) Summary {
	var s Summary
	fo, okF := parseOutline(front.PathData)
	bo, okB := parseOutline(back.PathData)
	if !okF || !okB {
		return s
	}
	lf := func(p Piece, k string) point { q, _ := lmPoint(p, k); return q }
	sideF, okSF := seamBetween(fo, lf(front, "waistSide"), lf(front, "hemSide"))
	sideB, okSB := seamBetween(bo, lf(back, "waistSide"), lf(back, "hemSide"))
	s.Finished = append(s.Finished,
		finished("hip", "Hip", "Lingkar panggul", 2*(lf(front, "hipSide").x+lf(back, "hipSide").x)),
		finished("hem", "Hem", "Lingkar bawah", 2*(lf(front, "hemSide").x+lf(back, "hemSide").x)),
		finished("length", "Length", "Panjang rok", lf(front, "hemCF").y),
	)
	s.Checks = append(s.Checks, seamsMatch("Side seams the same length", sideF, sideB, okSF, okSB, 0.4))
	if a1, ok := cornerAngle(fo, lf(front, "waistSide")); ok {
		a2, _ := cornerAngle(bo, lf(back, "waistSide"))
		s.Checks = append(s.Checks, squareCorners("Waist meets the side seams square", a1, a2))
	}
	return s
}

func distance(a, b point) float64 { return math.Hypot(a.x-b.x, a.y-b.y) }
