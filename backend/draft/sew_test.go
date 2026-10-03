package draft

import (
	"math"
	"testing"
)

// These are the checks a pattern maker runs before a pattern is cut, and
// the ones the shop's pattern maker found our pieces failing: seams that are
// sewn together are the same length, seams meet square where they join (so
// the garment has no peak at the shoulder, no point under the arm and no
// notch at the side of the hem), dart legs are the same length, and the
// garment goes over the body.

// cornerAt is the angle (degrees) the outline turns through at the end of
// the segment that finishes at p, measured inside the piece.
func cornerAt(t *testing.T, name string, o outline, p Point) float64 {
	t.Helper()
	at := point{p.X, p.Y}
	a := o.start
	for i, s := range o.segs {
		if dist2(s.p, at) < 0.02 {
			in := sub(s.p, a)
			if s.curve && dist2(s.p, s.c2) > 1e-6 {
				in = sub(s.p, s.c2)
			}
			next := o.segs[(i+1)%len(o.segs)]
			out := sub(next.p, s.p)
			if next.curve && dist2(next.c1, s.p) > 1e-6 {
				out = sub(next.c1, s.p)
			}
			cos := -dot(in, out) / math.Hypot(in.x, in.y) / math.Hypot(out.x, out.y)
			return math.Acos(clamp(cos, -1, 1)) * 180 / math.Pi
		}
		a = s.p
	}
	t.Fatalf("%s: no corner at %v", name, p)
	return 0
}

// frontEdge is the length of a front's straight edge past centre front: the
// edge of its button extension, which the placket is sewn along. It checks
// the extension reaches buttonExtension past centre front.
func frontEdge(t *testing.T, p Piece) float64 {
	t.Helper()
	o, ok := parseOutline(p.PathData)
	if !ok {
		t.Fatalf("%s: outline doesn't parse", p.Name)
	}
	if dist2(o.end(), o.start) > 1e-4 {
		o.segs = append(o.segs, seg{p: o.start})
	}
	a := o.start
	for _, s := range o.segs {
		if !s.curve && math.Abs(a.x+buttonExtension) < 0.05 && math.Abs(s.p.x+buttonExtension) < 0.05 {
			return math.Abs(s.p.y - a.y)
		}
		a = s.p
	}
	t.Fatalf("%s: no front edge %.1fcm past centre front: %s", p.Name, buttonExtension, p.PathData)
	return 0
}

func landmark(p Piece, k string) point { return point{p.Landmarks[k].X, p.Landmarks[k].Y} }

// seamLength is the length of the outline between two of its points.
func seamLength(t *testing.T, name string, o outline, from, to Point) float64 {
	t.Helper()
	a := o.start
	on := false
	total := 0.0
	for _, s := range append(o.segs, o.segs...) {
		if on {
			total += segLength(a, s)
			if dist2(s.p, point{to.X, to.Y}) < 0.02 {
				return total
			}
		}
		if !on && dist2(s.p, point{from.X, from.Y}) < 0.02 {
			on = true
		}
		a = s.p
	}
	t.Fatalf("%s: can't follow the outline from %v to %v", name, from, to)
	return 0
}

func TestShirtPiecesSewTogether(t *testing.T) {
	m := Measurements{Bust: 90, Waist: 72, BackWaistLength: 40, Shoulder: 12.5, Neck: 36, Ease: 6, SleeveLength: 58, UpperArm: 28, Wrist: 17, Hip: 98}
	cases := map[string]ShirtOptions{
		"unisex":         {Collar: true, SleeveStyle: "half"},
		"male long yoke": {Gender: "male", Collar: true, SleeveStyle: "full", BackStyle: "yoke"},
		"plain back":     {Collar: true, SleeveStyle: "half", BackStyle: "plain"},
		"polo":           {Collar: true, CollarStyle: "polo", SleeveStyle: "half"},
	}
	for _, pos := range DartPositions {
		cases["female "+pos] = ShirtOptions{Gender: "female", DartPosition: pos, Collar: true, SleeveStyle: "half", BackStyle: "plain"}
	}
	cases["female yoke"] = ShirtOptions{Gender: "female", Collar: true, SleeveStyle: "half"}

	for name, opts := range cases {
		ps := DraftShirt(m, opts)
		var front, back, yoke, sleeve, placket Piece
		for _, p := range ps {
			switch p.Name {
			case "Shirt front", "Bodice front":
				front = p
			case "Shirt back", "Bodice back":
				back = p
			case "Yoke":
				yoke = p
			case "Sleeve":
				sleeve = p
			case "Placket":
				placket = p
			}
		}
		drawn := func(p Piece) outline {
			d := p.Outline
			if d == "" {
				d = p.PathData
			}
			o, ok := parseOutline(d)
			if !ok {
				t.Fatalf("%s %s: outline doesn't parse", name, p.Name)
			}
			return o
		}
		fo, bo := drawn(front), drawn(back)
		top := back // the back's shoulder is on the yoke when there is one
		if yoke.Name != "" {
			top = yoke
		}
		to := drawn(top)

		// Shoulder seams: the back 1cm longer, eased in over the blade (Bunka).
		fs := dist(landmark(front, "neckPoint"), landmark(front, "shoulderTip"))
		bs := dist(landmark(top, "neckPoint"), landmark(top, "shoulderTip"))
		if d := bs - fs; d < shoulderEase-0.15 || d > shoulderEase+0.15 {
			t.Errorf("%s: back shoulder %.1f vs front %.1f", name, bs, fs)
		}
		// Side seams the same length.
		fl := seamLength(t, name, fo, front.Landmarks["underarm"], front.Landmarks["hemSide"])
		bl := seamLength(t, name, bo, back.Landmarks["underarm"], back.Landmarks["hemSide"])
		if math.Abs(fl-bl) > 0.4 {
			t.Errorf("%s: side seams front %.1f back %.1f", name, fl, bl)
		}
		// Square where the seams meet.
		for _, c := range []struct {
			what string
			o    outline
			p    Piece
			at   string
		}{
			{"front shoulder/armhole", fo, front, "shoulderTip"},
			{"front armhole/side", fo, front, "underarm"},
			{"front side/hem", fo, front, "hemSide"},
			{"back armhole/side", bo, back, "underarm"},
			{"back side/hem", bo, back, "hemSide"},
			{"back shoulder/armhole", to, top, "shoulderTip"},
		} {
			if a := cornerAt(t, name+" "+c.what, c.o, c.p.Landmarks[c.at]); math.Abs(a-90) > 4 {
				t.Errorf("%s: %s meet at %.0f°, want 90", name, c.what, a)
			}
		}
		// The sleeve's cap and hem meet its underarm seams square.
		so, _ := parseOutline(sleeve.PathData)
		for _, k := range []string{"backUnderarm", "frontUnderarm", "backWrist", "frontWrist"} {
			if a := cornerAt(t, name+" sleeve", so, sleeve.Landmarks[k]); math.Abs(a-90) > 4 {
				t.Errorf("%s: sleeve corner %s at %.0f°, want 90", name, k, a)
			}
		}
		// The hem goes over the hip.
		if hem := 4 * math.Min(front.Landmarks["hemSide"].X, back.Landmarks["hemSide"].X); hem < m.Hip {
			t.Errorf("%s: hem %.0fcm round, hip %.0fcm", name, hem, m.Hip)
		}
		// Every dart's legs are the same length, so it sews closed flat.
		for _, p := range []Piece{front, back} {
			for _, d := range p.Darts {
				if len(d) == 3 {
					l1, l2 := dist(point{d[0].X, d[0].Y}, point{d[1].X, d[1].Y}), dist(point{d[2].X, d[2].Y}, point{d[1].X, d[1].Y})
					if math.Abs(l1-l2) > 0.2 {
						t.Errorf("%s %s: dart legs %.1f and %.1f", name, p.Name, l1, l2)
					}
				}
			}
		}
		// A placket runs the front edge it is sewn to.
		if placket.Name != "" && opts.FrontStyle == "" {
			edge := frontEdge(t, front)
			if math.Abs(placket.Height-edge) > 0.5 {
				t.Errorf("%s: placket %.1f for a %.1f front edge", name, placket.Height, edge)
			}
		}
	}
}

// The fitted block's waist, darts sewn, is the waist plus half the chest's
// ease, as in the Bunka block (half the bust + 6, half the waist + 3).
func TestFittedWaistIsTheWaistPlusEase(t *testing.T) {
	m := Measurements{Bust: 90, Waist: 72, BackWaistLength: 40, Shoulder: 12.5, Neck: 36, Ease: 6, Hip: 98}
	ps := DraftBodice(m, "waist")
	waist := 0.0
	for _, p := range ps[:2] {
		d := p.Darts[len(p.Darts)-1] // the waist dart: leg, tip, leg
		side := p.Landmarks["hemSide"].X
		waist += 2 * (side - math.Abs(d[2].X-d[0].X))
	}
	near(t, "bodice waist", waist, m.Waist+m.Ease/2, 1)
}

func TestTrouserSeamsMatch(t *testing.T) {
	m := Measurements{Waist: 72, Hip: 98, Rise: 26, Inseam: 75, Ease: 6}
	ps := DraftTrousers(m, "Pants", AddOns{}, TrouserOptions{})
	f, b := pieceNamed(t, ps, "Pants front"), pieceNamed(t, ps, "Pants back")
	fo, _ := parseOutline(f.PathData)
	bo, _ := parseOutline(b.PathData)
	inseam := func(o outline, p Piece) float64 {
		return seamLength(t, p.Name, o, p.Landmarks["crotchPt"], p.Landmarks["hemInseam"])
	}
	side := func(o outline, p Piece) float64 {
		return seamLength(t, p.Name, o, p.Landmarks["hemSide"], p.Landmarks["waistSide"])
	}
	near(t, "inseams, back vs front", inseam(bo, b), inseam(fo, f), 0.3)
	near(t, "side seams, back vs front", side(bo, b), side(fo, f), 0.3)
	near(t, "front crotch extension", f.Landmarks["centerLine"].X, 5.2, 0.5)
	near(t, "back crotch extension", b.Landmarks["centerLine"].X, 11.4, 0.6)
}

// The summary the app shows (finished measurements and seam checks) passes
// every check on every drafted style, and its measurements are the drafted
// ones.
func TestSummaryChecksPass(t *testing.T) {
	m := Measurements{Bust: 90, Waist: 72, BackWaistLength: 40, Shoulder: 12.5, Neck: 36, Ease: 6, SleeveLength: 58, UpperArm: 28, Wrist: 17, Hip: 98, Rise: 26, Inseam: 75, SkirtLength: 55}
	cases := map[string][]Piece{
		"unisex regular":  DraftShirt(m, ShirtOptions{Collar: true, SleeveStyle: "half", Fit: "regular"}),
		"male long loose": DraftShirt(m, ShirtOptions{Gender: "male", Collar: true, SleeveStyle: "full", Fit: "loose"}),
		"polo":            DraftShirt(m, ShirtOptions{Collar: true, CollarStyle: "polo", SleeveStyle: "half"}),
		"trousers":        DraftTrousers(m, "Pants", AddOns{}, TrouserOptions{}),
		"skirt":           DraftSkirt(m, AddOns{}, SkirtOptions{}),
	}
	for _, pos := range DartPositions {
		cases["female "+pos] = DraftShirt(m, ShirtOptions{Gender: "female", DartPosition: pos, Collar: true, SleeveStyle: "half", Fit: "regular"})
	}
	for name, ps := range cases {
		s := Summarize(FinishAll(ps), m)
		if len(s.Finished) == 0 || len(s.Checks) == 0 {
			t.Errorf("%s: empty summary", name)
		}
		for _, c := range s.Checks {
			if !c.OK {
				t.Errorf("%s: %s — %s", name, c.Label, c.Detail)
			}
		}
	}
	// A cuffed sleeve, cuff included, is the sleeve length.
	for _, f := range Summarize(FinishAll(cases["male long loose"]), m).Finished {
		if f.Key == "sleeve" {
			near(t, "long sleeve with its cuff", f.CM, m.SleeveLength, 0.3)
		}
	}
	// A regular fit adds 6cm to the chart's 6: the chest is the bust + 12.
	for _, f := range Summarize(FinishAll(cases["unisex regular"]), m).Finished {
		if f.Key == "chest" {
			near(t, "regular-fit chest", f.CM, m.Bust+12, 0.2)
		}
	}
}

// A child's size with no hip measured isn't flared out to the adult default
// hip (98cm): the hem stays the chest's width.
func TestChildShirtWithoutHipIsNotFlared(t *testing.T) {
	m := Measurements{Bust: 60, Waist: 56, BackWaistLength: 28.7, Shoulder: 9.8, Neck: 29, Ease: 10, SleeveLength: 38, UpperArm: 21, Wrist: 13}
	ps := DraftShirt(m, ShirtOptions{Collar: true, SleeveStyle: "half"})
	f := pieceNamed(t, ps, "Shirt front")
	near(t, "child front hem width", f.Landmarks["hemSide"].X, f.Landmarks["underarm"].X, 0.05)
	for _, c := range Summarize(FinishAll(ps), m).Checks {
		if !c.OK {
			t.Errorf("%s — %s", c.Label, c.Detail)
		}
	}
}

// A back with a box pleat under the yoke: the back panel is cut wider at
// centre back by the pleat (half of it on the half cut on the fold), the
// fold still gets no seam allowance, and the shirt still sews (every check
// passes) and is drawn at its sewn width.
func TestBackPleat(t *testing.T) {
	m := Measurements{Bust: 94, Waist: 86, Hip: 100, BackWaistLength: 43, Shoulder: 16, Neck: 40, Ease: 6, SleeveLength: 63, UpperArm: 31, Wrist: 17}
	plain := pieceNamed(t, FinishAll(DraftShirt(m, ShirtOptions{Collar: true, BackStyle: "yoke"})), "Shirt back")
	ps := FinishAll(DraftShirt(m, ShirtOptions{Collar: true, BackStyle: "yoke_pleat"}))
	pleated := pieceNamed(t, ps, "Shirt back")
	near(t, "back cut wider by half the pleat (on the fold)", pleated.CutWidth-plain.CutWidth, backPleat/2, 0.15)
	near(t, "fold edge has no allowance", pleated.CutOffset.X, backPleat/2, 0.15)
	if pleated.Outline != plain.PathData {
		t.Errorf("the drawing should keep the sewn back")
	}
	for _, c := range Summarize(ps, m).Checks {
		if !c.OK {
			t.Errorf("%s — %s", c.Label, c.Detail)
		}
	}
}
