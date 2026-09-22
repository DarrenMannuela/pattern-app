package draft

import (
	"math"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// These tests pin the drafting formulas against dimensions read off the
// reference pattern charts the shop has collected (boys' size-8 shirt,
// 5XL polo, men's tailored trousers). They are the ground truth for
// "does our output look like a real pattern" — when a formula change
// moves one of these, the chart is what decides who is right, not a
// screenshot. Trouser assertions are ratios, since the chart's size
// (L) isn't ours.

func near(t *testing.T, name string, got, want, tol float64) {
	t.Helper()
	if math.Abs(got-want) > tol {
		t.Errorf("%s = %.2f, chart says %.2f (±%.2f)", name, got, want, tol)
	}
}

func pieceNamed(t *testing.T, ps []Piece, name string) Piece {
	t.Helper()
	for _, p := range ps {
		if p.Name == name {
			return p
		}
	}
	t.Fatalf("no piece named %q", name)
	return Piece{}
}

func TestReferenceBoys8Shirt(t *testing.T) {
	// Chart: front 18 wide, neck 5.5 + shoulder 8, armhole 15.5 below a
	// 1.25 shoulder drop, collar stand 16, sleeve 26.5 wide x 42 long.
	m := Measurements{Bust: 66, Waist: 62, BackWaistLength: 28.7, ShirtLength: 50, Shoulder: 8, Neck: 29, Ease: 6, SleeveLength: 42, UpperArm: 24, Wrist: 15, Hip: 70}
	ps := DraftShirt(m, ShirtOptions{Gender: "unisex", Collar: true, SleeveStyle: "full"})

	front := pieceNamed(t, ps, "Shirt front")
	near(t, "front width (straight side, no hem flare)", front.Width, 18, 0.3)
	near(t, "shoulder tip x", front.ShoulderTip.X, 13.5, 0.5)
	near(t, "underarm depth from neck line", shirtScye(66), 15.5+1.25, 0.6)
	near(t, "collar stand length", pieceNamed(t, ps, "Collar stand").Width, 16, 1.5)
	sleeve := pieceNamed(t, ps, "Sleeve")
	near(t, "sleeve width", sleeve.Width, 26.5, 1.5)
	near(t, "sleeve length", sleeve.Height, 42, 0.1)
	near(t, "sleeve cap height (chart: 8)", pathPoints(sleeve.PathData)[1].y, 8, 1.5)
}

func TestBodiceArmholeDepthMatchesShirtScye(t *testing.T) {
	// DraftBodice and DraftShirt draft the same real quantity (armhole/scye
	// depth) and must use the same, chart-cited formula (shirtScye) — this
	// pins a real bug found by review: DraftBodice was still using an older
	// "Bust/4 + 2.5" formula shirt.go's own comment says drafts an armhole
	// 2-5cm too deep, after the shirt draft had already moved off it.
	m := Measurements{Bust: 96, Waist: 84, BackWaistLength: 42, Shoulder: 13, Neck: 38, Ease: 6, SleeveLength: 60, UpperArm: 30, Wrist: 18}
	ps := DraftBodice(m, "waist")
	back := pieceNamed(t, ps, "Bodice back")
	underarm := pathPoints(back.PathData)[3]
	near(t, "bodice back underarm depth", underarm.y, round1(shirtScye(m.Bust)), 0.05)
	if old := round1(m.Bust/4 + 2.5); math.Abs(underarm.y-old) < 0.05 {
		t.Errorf("still using the discredited Bust/4+2.5 formula (got %.2f, that formula gives %.2f)", underarm.y, old)
	}
}

func TestReferencePolo5XLUnderarmDepth(t *testing.T) {
	// Chart: chest 164 (41 wide quarter panel), underarm 4.5 + 37.5 below the neck line.
	near(t, "underarm depth from neck line", shirtScye(164), 4.5+37.5, 1.0)
}

func TestReferenceTrousers(t *testing.T) {
	// Chart (front): thigh line 37, hem 29 -> hem is 0.78 of the width
	// at the crotch line; back thigh 43 -> back is 1.16x the front.
	m := Measurements{Waist: 82, Hip: 104, Rise: 28, Inseam: 76, Ease: 4}
	ps := DraftTrousers(m, "Pants", AddOns{}, TrouserOptions{})
	front, back := pieceNamed(t, ps, "Pants front"), pieceNamed(t, ps, "Pants back")

	fl := front.Landmarks
	hemRatio := (fl["hemSide"].X - fl["hemInseam"].X) / (fl["hipSide"].X - fl["crotchPt"].X)
	near(t, "front hem / thigh width", hemRatio, 29.0/37.0, 0.08)
	near(t, "back / front thigh width", back.Landmarks["hipSide"].X/fl["hipSide"].X, 43.0/37.0, 0.06)
	if back.Landmarks["centerLine"].X <= fl["centerLine"].X {
		t.Errorf("back crotch extension (%.1f) should exceed front (%.1f)", back.Landmarks["centerLine"].X, fl["centerLine"].X)
	}
	// Block structure: the back waist sits above-and-outside the front's,
	// the side seam is wider at the hip than at the waist, and the legs
	// have a knee that is no narrower than the hem.
	if back.Landmarks["waistSide"].Y <= fl["waistSide"].Y {
		t.Errorf("the back waist should dip toward the side seam")
	}
	if fl["hipSide"].X <= fl["waistSide"].X {
		t.Errorf("hip (%.1f) should be wider than waist (%.1f)", fl["hipSide"].X, fl["waistSide"].X)
	}
	near(t, "knee wider than hem", fl["kneeSide"].X-fl["kneeInseam"].X-(fl["hemSide"].X-fl["hemInseam"].X), 3, 0.2)
	// Everything sits in positive pattern space.
	for _, p := range []Piece{front, back} {
		for _, pt := range pathPoints(p.PathData) {
			if pt.x < -0.05 || pt.y < -0.05 || pt.x > p.Width+0.05 || pt.y > p.Height+0.05 {
				t.Errorf("%s: point %.1f,%.1f outside %.1f x %.1f", p.Name, pt.x, pt.y, p.Width, p.Height)
			}
		}
	}
}

func hasPiece(ps []Piece, name string) bool {
	for _, p := range ps {
		if p.Name == name {
			return true
		}
	}
	return false
}

// The preview finds the main panels by matching "front", "back",
// "sleeve" and "placket" in piece names; a detail piece whose name
// contains one would be picked up as the panel instead.
func TestDetailPieceNamesDontCollideWithPanelLookups(t *testing.T) {
	m := Measurements{Bust: 96, Waist: 84, Hip: 100}
	all := append(DraftShirt(m, ShirtOptions{Collar: true, SleeveStyle: "full"}), DraftTrousers(m, "Pants", AddOns{}, TrouserOptions{})...)
	for _, n := range []string{"Cuff", "Cuff slit facing", "Belt loop", "Slant pocket bag", "Welt strip", "Welt pocket bag", "Fly facing"} {
		p := pieceNamed(t, all, n)
		for _, bad := range []string{"front", "back", "sleeve", "placket"} {
			if containsFold(p.Name, bad) {
				t.Errorf("piece %q contains %q and would collide with the preview's panel lookup", p.Name, bad)
			}
		}
	}
}

func containsFold(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		ls, lsub := []rune(s), []rune(sub)
		for i := 0; i+len(lsub) <= len(ls); i++ {
			ok := true
			for j := range lsub {
				a, b := ls[i+j], lsub[j]
				if a >= 'A' && a <= 'Z' {
					a += 32
				}
				if a != b {
					ok = false
					break
				}
			}
			if ok {
				return true
			}
		}
		return false
	})()
}

func TestShirtCuffsFollowSleeveLength(t *testing.T) {
	m := Measurements{Bust: 66, Wrist: 14, SleeveLength: 42, Shoulder: 8, Neck: 29}
	long := DraftShirt(m, ShirtOptions{SleeveStyle: "full"})
	// Chart: 17cm cuff for a ~14cm wrist; slit strip 13 x 2.
	near(t, "cuff length", pieceNamed(t, long, "Cuff").Width, 17, 0.6)
	near(t, "cuff slit length", pieceNamed(t, long, "Cuff slit facing").Height, 11.8, 2.0)
	if hasPiece(DraftShirt(m, ShirtOptions{SleeveStyle: "half"}), "Cuff") {
		t.Error("a short sleeve should not get a buttoned cuff")
	}
}

func TestPoloHasKnitConstructionAndNoYoke(t *testing.T) {
	m := Measurements{Bust: 112, Neck: 40, Shoulder: 13, SleeveLength: 60}
	ps := DraftShirt(m, ShirtOptions{Collar: true, CollarStyle: "polo", SleeveStyle: "half"})
	for _, want := range []string{"Polo collar", "Polo placket", "Sleeve rib", "Shirt front", "Shirt back", "Sleeve"} {
		if !hasPiece(ps, want) {
			t.Errorf("polo is missing %q", want)
		}
	}
	for _, not := range []string{"Yoke", "Cuff", "Placket"} {
		if hasPiece(ps, not) {
			t.Errorf("polo should not have %q", not)
		}
	}
	near(t, "polo placket width (chart 6.5)", pieceNamed(t, ps, "Polo placket").Width, 6.5, 0.1)
}

// pathPoints returns every command's end point from an M/L/C-only path.
func pathPoints(d string) []point {
	toks := strings.Fields(strings.NewReplacer("M", " M ", "L", " L ", "C", " C ", "Z", " Z ").Replace(strings.ReplaceAll(d, ",", " ")))
	var pts []point
	var nums []float64
	flush := func() {
		if len(nums) >= 2 {
			pts = append(pts, point{nums[len(nums)-2], nums[len(nums)-1]})
		}
		nums = nil
	}
	for _, t := range toks {
		if v, err := strconv.ParseFloat(t, 64); err == nil {
			nums = append(nums, v)
		} else {
			flush()
		}
	}
	flush()
	return pts
}

func dist(a, b point) float64 { return math.Hypot(a.x-b.x, a.y-b.y) }

// Truing: seams that get sewn together must be the same length (the
// article's "verify connected seams match" step), and the sleeve cap
// must run the armhole plus a little ease.
func TestSeamsAreTrued(t *testing.T) {
	for _, tc := range []struct{ q, scye, neck, sh, h float64 }{
		{18, 16.5, 5.8, 8, 50},    // boys' 8
		{28.5, 26.5, 7.8, 13, 72}, // adult
	} {
		f, fa, _ := draftRelaxedFront(tc.q, tc.scye, tc.neck, tc.sh, tc.h, "f")
		b, ba, _ := draftRelaxedBack(tc.q, tc.scye, tc.neck, tc.sh, tc.h, "b")
		fp, bp := pathPoints(f.PathData), pathPoints(b.PathData)
		// points: cf-neck, neck point, shoulder tip, underarm, hem side, ...
		near(t, "side seam, front vs back", dist(fp[3], fp[4]), dist(bp[3], bp[4]), 0.2)
		if d := dist(bp[1], bp[2]) - dist(fp[1], fp[2]); d < 0 || d > 1.0 {
			t.Errorf("back shoulder should be 0-1cm longer than front (ease), got %+.2f", d)
		}

		upperArm, ease := 0.36*tc.q*4-1, 6.0
		sl := draftSleeve(fa+ba, 55, upperArm, 16, ease, "full", "s")
		hb := (upperArm + ease/3) / 2
		capH, full := solveSleeveCap(hb, fa+ba)
		near(t, "sleeve cap length minus armhole", sleeveCapLength(hb, capH, full)-(fa+ba), sleeveCapEase, 0.3)
		near(t, "piece crown-to-underarm height", pathPoints(sl.PathData)[1].y, capH, 0.1)
		if r := capH / (fa + ba); r < 0.22 || r > 0.32 {
			t.Errorf("cap height / armhole = %.2f, charts sit at 0.24-0.27", r)
		}
	}
}

func TestFinishAddsSeamAndHemAllowances(t *testing.T) {
	// A 10x10 strip with no fold: 1cm on all four sides -> 12x12,
	// sewing line sitting 1cm in from the cut line.
	loop := Finish(draftRectPiece("Belt loop", 10, 10, "", ""))
	near(t, "strip cut width", loop.CutWidth, 12, 0.05)
	near(t, "strip cut height", loop.CutHeight, 12, 0.05)
	near(t, "strip offset x", loop.CutOffset.X, 1, 0.05)

	// On a fold edge no allowance is added on that edge (left) — and on
	// a "bottom" fold (cuff) none at the bottom.
	half := Finish(draftRectPiece("Half", 10, 10, "left", ""))
	near(t, "fold-left cut width (no allowance on the fold)", half.CutWidth, 11, 0.05)
	cuff := Finish(draftRectPiece("Cuff", 17, 8, "bottom", ""))
	near(t, "cuff cut height (fold at the bottom)", cuff.CutHeight, 9, 0.05)

	// Trouser hem gets 4cm, waist and seams 1cm.
	pants := DraftTrousers(Measurements{Waist: 82, Hip: 104, Rise: 28, Inseam: 76, Ease: 4}, "Pants", AddOns{}, TrouserOptions{})
	front := Finish(pieceNamed(t, pants, "Pants front"))
	near(t, "trouser cut height = length + 4 hem + 1 waist", front.CutHeight, front.Height+5, 0.2)

	// Every finished piece has a grainline that lies within its own bounds.
	for _, p := range FinishAll(pants) {
		g := p.Grainline
		if g == nil || g[0] < -0.01 || g[0] > p.Width+0.01 || g[2] < -0.01 || g[2] > p.Width+0.01 {
			t.Errorf("%s: grainline %v outside piece width %.1f", p.Name, g, p.Width)
		}
	}
}

// The collar pieces must be real curved shapes like the reference sheet's,
// not the near-straight 3-4cm strips they used to be.
func TestCollarPiecesAreShapedLikeTheReferences(t *testing.T) {
	const neck = 17.5
	pp := draftPeterPanCollarLeaf(neck)
	if pp.Height < 0.55*pp.Width {
		t.Errorf("Peter Pan should be a deep crescent (sheet: 13.4 x 18.9), got %.1f x %.1f", pp.Width, pp.Height)
	}
	near(t, "Peter Pan fold edge (sheet: 7.5)", pathPoints(pp.PathData)[len(pathPoints(pp.PathData))-1].y-pathPoints(pp.PathData)[0].y, 7.5*collarHeightScale(neck), 0.4)
	band := draftStandingCollar(neck)
	near(t, "band length includes the lifted front end (sheet 23.2 at neck 22.2)", band.Width, neck+1, 0.4)
	if band.Height < 3.5 || band.Height > 9 {
		t.Errorf("band height %.1f outside a real band collar's range", band.Height)
	}
	leaf := draftCollarLeaf(neck)
	if leaf.Height < 5 {
		t.Errorf("point collar leaf height %.1f — the strip version was 4", leaf.Height)
	}
	if !(draftSpreadCollarLeaf(neck).Width > leaf.Width) {
		t.Error("a spread collar's point should reach further than a classic one's")
	}
}

func collarHeightScale(neck float64) float64 { _, sy := collarScale(neck, 1); return sy }

func TestShirtConstructionOptions(t *testing.T) {
	m := Measurements{Bust: 96, Waist: 84, BackWaistLength: 42, Shoulder: 13, Neck: 38, Ease: 6, SleeveLength: 60, UpperArm: 30, Wrist: 18}
	base := DraftShirt(m, ShirtOptions{Collar: true})
	front := pieceNamed(t, base, "Shirt front")
	near(t, "auto shirt length = 1.75 x back length", front.Height, 42*1.75, 0.1)
	if !hasPiece(base, "Yoke") {
		t.Errorf("default back should have a yoke")
	}
	near(t, "full placket runs the front", pieceNamed(t, base, "Placket").Height, front.Height, 0.1)

	opt := DraftShirt(m, ShirtOptions{Collar: true, FrontStyle: "half_placket", BackStyle: "plain", HemStyle: "straight"})
	if hasPiece(opt, "Yoke") {
		t.Errorf("plain back should have no yoke piece")
	}
	if pieceNamed(t, opt, "Placket").Height > 0.5*front.Height {
		t.Errorf("half placket should stop well short of the hem")
	}
	if strings.Contains(pieceNamed(t, opt, "Shirt front").PathData, "C") && strings.Count(pieceNamed(t, opt, "Shirt front").PathData, "C") > 2 {
		t.Errorf("straight hem should not add a curve")
	}
	if pieceNamed(t, base, "Shirt front").PathData == pieceNamed(t, opt, "Shirt front").PathData {
		t.Errorf("curved and straight hems drafted the same outline")
	}
	if hasPiece(DraftShirt(m, ShirtOptions{Collar: true, FrontStyle: "plain"}), "Placket") {
		t.Errorf("plain front should have no placket")
	}
}

func TestCuffedSleeveOpensAsWideAsItsCuff(t *testing.T) {
	m := Measurements{Bust: 96, Waist: 84, BackWaistLength: 42, Shoulder: 13, Neck: 38, Ease: 6, SleeveLength: 60, UpperArm: 30, Wrist: 18}
	ps := DraftShirt(m, ShirtOptions{Collar: true, SleeveStyle: "full"})
	sleeve := pieceNamed(t, ps, "Sleeve")
	cuff := pieceNamed(t, ps, "Cuff")
	pts := pathPoints(sleeve.PathData)
	lo, hi := 1e9, -1e9
	for _, p := range pts {
		if p.y >= sleeve.Height-0.05 {
			lo, hi = math.Min(lo, p.x), math.Max(hi, p.x)
		}
	}
	opening := hi - lo // the hem edge, back wrist to front wrist
	if opening < cuff.Width {
		t.Errorf("sleeve opening %.1f is narrower than its %.1f cuff", opening, cuff.Width)
	}
}

func TestPocketShapeAndSize(t *testing.T) {
	m := Measurements{Bust: 96, Waist: 84, BackWaistLength: 42, Shoulder: 13, Neck: 38, Ease: 6, SleeveLength: 60, UpperArm: 30, Wrist: 18}
	pocket := func(shape string, w, h float64) Piece {
		ps := DraftShirt(m, ShirtOptions{Collar: true, AddOns: AddOns{Accessories: []Accessory{{ID: "a", Type: "pocket", Segment: SegmentLeftChest, Shape: shape, Width: w, Height: h}}}})
		return pieceNamed(t, ps, pocketName(SegmentLeftChest))
	}
	sq := pocket("square", 11, 13)
	near(t, "pocket width follows the request", sq.Width, 11, 0.05)
	near(t, "pocket height follows the request", sq.Height, 13, 0.05)
	if strings.Contains(sq.PathData, "C") {
		t.Errorf("a square pocket should have no curved corners: %s", sq.PathData)
	}
	if !strings.Contains(pocket("rounded", 11, 13).PathData, "C") {
		t.Errorf("a rounded pocket should have curved corners")
	}
	if got := len(pathPoints(pocket("pointed", 11, 13).PathData)); got < 5 {
		t.Errorf("a pointed pocket should be a pentagon, got %d points", got)
	}
}

func TestPocketRotationIsNoted(t *testing.T) {
	m := Measurements{Bust: 96, Waist: 84, BackWaistLength: 42, Shoulder: 13, Neck: 38, Ease: 6, SleeveLength: 60, UpperArm: 30, Wrist: 18}
	notes := func(deg float64) string {
		ps := DraftShirt(m, ShirtOptions{Collar: true, AddOns: AddOns{Accessories: []Accessory{{ID: "a", Type: "pocket", Segment: SegmentLeftChest, Rotation: deg}}}})
		return pieceNamed(t, ps, pocketName(SegmentLeftChest)).Notes
	}
	if n := notes(0); strings.Contains(n, "turned") {
		t.Errorf("an upright pocket needs no rotation note: %s", n)
	}
	if n := notes(-15); !strings.Contains(n, "15° anticlockwise") {
		t.Errorf("a pocket turned -15 should say so: %s", n)
	}
	if n := notes(370); !strings.Contains(n, "10° clockwise") {
		t.Errorf("370 degrees should fold to 10 clockwise: %s", n)
	}
}

func TestSleevePocketNamesItsFace(t *testing.T) {
	m := Measurements{Bust: 96, Waist: 84, BackWaistLength: 42, Shoulder: 13, Neck: 38, Ease: 6, SleeveLength: 60, UpperArm: 30, Wrist: 18}
	notes := func(seg, view string) string {
		ps := DraftShirt(m, ShirtOptions{Collar: true, AddOns: AddOns{Accessories: []Accessory{{ID: "a", Type: "pocket", Segment: seg, View: view}}}})
		return pieceNamed(t, ps, pocketName(seg)).Notes
	}
	for view, want := range map[string]string{"front": "front of the sleeve", "back": "back of the sleeve", "left": "outside of the sleeve"} {
		if n := notes(SegmentLeftSleeve, view); !strings.Contains(n, want) {
			t.Errorf("view %q should say %q: %s", view, want, n)
		}
	}
	if n := notes(SegmentLeftSleeve, ""); strings.Contains(n, "of the sleeve") {
		t.Errorf("no view, no face: %s", n)
	}
	if n := notes(SegmentLeftChest, "front"); strings.Contains(n, "of the sleeve") {
		t.Errorf("a chest pocket has no sleeve face: %s", n)
	}
}

func TestMotifBands(t *testing.T) {
	m := Measurements{Bust: 96, Waist: 84, BackWaistLength: 42, Shoulder: 13, Neck: 38, Ease: 6, SleeveLength: 60, UpperArm: 30, Wrist: 18}
	base := DraftShirt(m, ShirtOptions{Collar: true})
	if len(base) == 0 {
		t.Fatal("no shirt")
	}
	// The preview finds the main panels by these words; a motif piece must not carry them.
	reserved := regexp.MustCompile(`(?i)front|back|sleeve|collar|placket`)
	for _, place := range MotifPlacements {
		ps := DraftShirt(m, ShirtOptions{Collar: true, Motifs: []string{place}, Pattern: "batik"})
		if len(ps) <= len(base) {
			t.Errorf("%q should add a piece", place)
			continue
		}
		for _, p := range ps[len(base):] {
			if reserved.MatchString(p.Name) {
				t.Errorf("motif piece %q must not use a reserved word", p.Name)
			}
			if !strings.Contains(p.Notes, "batik") {
				t.Errorf("%q should say what it is cut in: %s", p.Name, p.Notes)
			}
			if p.Qty < 1 {
				t.Errorf("%q needs a quantity", p.Name)
			}
		}
		if ps[0].Name != base[0].Name {
			t.Errorf("the front must stay first")
		}
	}
	// A streak runs the length of the front; two are cut for a double streak.
	one := pieceNamed(t, DraftShirt(m, ShirtOptions{Collar: true, Motifs: []string{"centre"}}), "Motif streak")
	front := pieceNamed(t, base, "Shirt front")
	if one.Height < front.Height*0.7 || one.Height > front.Height {
		t.Errorf("a center streak should run collar to hem: %.1f of %.1f", one.Height, front.Height)
	}
	two := pieceNamed(t, DraftShirt(m, ShirtOptions{Collar: true, Motifs: []string{"double"}}), "Motif streak")
	if two.Qty != 2 {
		t.Errorf("a double streak is two strips, got %d", two.Qty)
	}
	// Repeats and unknown places are ignored.
	ps := DraftShirt(m, ShirtOptions{Collar: true, Motifs: []string{"hem", "hem", "nonsense"}})
	if len(ps) != len(base)+1 {
		t.Errorf("only one hem band expected, got %d extra", len(ps)-len(base))
	}
}

func TestContrastFabricTagging(t *testing.T) {
	m := Measurements{Bust: 96, Waist: 84, BackWaistLength: 42, Shoulder: 13, Neck: 38, Ease: 6, SleeveLength: 60, UpperArm: 30, Wrist: 18}
	byName := func(ps []Piece, name string) *Piece {
		for i := range ps {
			if ps[i].Name == name {
				return &ps[i]
			}
		}
		return nil
	}
	// A plain shirt: nothing is contrast fabric.
	plain := DraftShirt(m, ShirtOptions{Collar: true})
	for _, p := range plain {
		if p.Fabric == "contrast" {
			t.Errorf("a plain shirt has no contrast-fabric piece, got one: %q", p.Name)
		}
	}
	// The insert panel is contrast fabric; the front pieces either side of it are not.
	panelled := DraftShirt(m, ShirtOptions{Collar: true, Panel: "side"})
	if p := byName(panelled, "Insert panel"); p == nil || p.Fabric != "contrast" {
		t.Errorf("Insert panel should be contrast fabric: %+v", p)
	}
	for _, name := range []string{"Front inner (panel side)", "Front outer (panel side)"} {
		if p := byName(panelled, name); p == nil || p.Fabric == "contrast" {
			t.Errorf("%q should stay the main fabric: %+v", name, p)
		}
	}
	// A contrast collar's piping is contrast fabric; the collar itself is not.
	piped := DraftShirt(m, ShirtOptions{Collar: true, Trim: "contrast"})
	if p := byName(piped, "Piping strip"); p == nil || p.Fabric != "contrast" {
		t.Errorf("Piping strip should be contrast fabric: %+v", p)
	}
	if p := byName(piped, "Collar leaf"); p != nil && p.Fabric == "contrast" {
		t.Errorf("the collar itself should stay the main fabric")
	}
	// A V-neck's trim is contrast fabric; its plain facing is not.
	trimmed := DraftShirt(m, ShirtOptions{Neckline: "v_neck", Trim: "contrast"})
	if p := byName(trimmed, "Neck trim"); p == nil || p.Fabric != "contrast" {
		t.Errorf("Neck trim should be contrast fabric: %+v", p)
	}
	faced := DraftShirt(m, ShirtOptions{Neckline: "v_neck"})
	if p := byName(faced, "Neck facing"); p == nil || p.Fabric == "contrast" {
		t.Errorf("Neck facing (self fabric) should not be contrast: %+v", p)
	}
	// Every motif band is contrast fabric.
	motifed := DraftShirt(m, ShirtOptions{Collar: true, Motifs: []string{"centre", "chest", "shoulder", "hem", "arms"}, Pattern: "batik"})
	for _, name := range []string{"Motif streak", "Chest band", "Shoulder band", "Hem band", "Arm motif band"} {
		if p := byName(motifed, name); p == nil || p.Fabric != "contrast" {
			t.Errorf("%q should be contrast fabric: %+v", name, p)
		}
	}
	// A trouser side stripe is contrast fabric; the legs are not.
	tm := Measurements{Waist: 82, Hip: 104, Rise: 28, Inseam: 76, Ease: 4}
	striped := DraftTrousers(tm, "Pants", AddOns{}, TrouserOptions{Stripe: "side"})
	if p := byName(striped, "Side stripe"); p == nil || p.Fabric != "contrast" {
		t.Errorf("Side stripe should be contrast fabric: %+v", p)
	}
	if p := byName(striped, "Pants front"); p != nil && p.Fabric == "contrast" {
		t.Errorf("the leg panel should stay the main fabric")
	}
	// Finish (seam allowance + grainline) must not drop the tag.
	finished := FinishAll(panelled)
	if p := byName(finished, "Insert panel"); p == nil || p.Fabric != "contrast" {
		t.Errorf("Finish should preserve the fabric tag: %+v", p)
	}
}

func TestContrastFabricPocket(t *testing.T) {
	m := Measurements{Bust: 96, Waist: 84, BackWaistLength: 42, Shoulder: 13, Neck: 38, Ease: 6, SleeveLength: 60, UpperArm: 30, Wrist: 18}
	pocket := func(fabric string) Piece {
		ps := DraftShirt(m, ShirtOptions{Collar: true, AddOns: AddOns{Accessories: []Accessory{{ID: "a", Type: "pocket", Segment: SegmentLeftChest, Fabric: fabric}}}})
		return pieceNamed(t, ps, pocketName(SegmentLeftChest))
	}
	if p := pocket(""); p.Fabric == "contrast" {
		t.Errorf("a pocket defaults to the main fabric: %+v", p)
	}
	p := pocket("contrast")
	if p.Fabric != "contrast" {
		t.Errorf("Fabric: \"contrast\" on the accessory should tag the drafted pocket piece: %+v", p)
	}
	if !strings.Contains(p.Notes, "contrast") {
		t.Errorf("a contrast pocket's notes should say so: %s", p.Notes)
	}
}

func TestMotifPiecesDoNotDoubleCountSeamAllowance(t *testing.T) {
	// Every block in this package is drafted allowance-free and gets its seam
	// allowance added exactly once, by Finish (see finish.go's own doc
	// comment). Motif pieces used to hand-bake an extra 1cm into their raw
	// dimensions on top of that, quietly inflating the cut size and yardage
	// estimate. A plain rectangle with no fold edge and a name Finish doesn't
	// recognise as a garment hem gets the ordinary 1cm seam allowance on
	// every edge, so a raw height/width of h should finish at h+2 exactly.
	m := Measurements{Bust: 96, Waist: 84, BackWaistLength: 42, Shoulder: 13, Neck: 38, Ease: 6, SleeveLength: 60, UpperArm: 30, Wrist: 18}
	ps := FinishAll(DraftShirt(m, ShirtOptions{Collar: true, Motifs: []string{"chest", "shoulder", "hem", "arms"}, Pattern: "batik"}))
	for name, rawHeight := range map[string]float64{"Chest band": 7, "Shoulder band": 8, "Hem band": 8, "Arm motif band": 5} {
		p := pieceNamed(t, ps, name)
		near(t, name+" cut height", p.CutHeight, rawHeight+2, 0.05)
	}
	streak := pieceNamed(t, FinishAll(DraftShirt(m, ShirtOptions{Collar: true, Motifs: []string{"centre"}})), "Motif streak")
	near(t, "motif streak cut width", streak.CutWidth, 5+2, 0.05)
}

func TestPoloHasStraightHemAndVent(t *testing.T) {
	m := Measurements{Bust: 96, Waist: 84, BackWaistLength: 42, Shoulder: 13, Neck: 38, Ease: 6, SleeveLength: 60, UpperArm: 30, Wrist: 18}
	ps := DraftShirt(m, ShirtOptions{Collar: true, CollarStyle: "polo", SleeveStyle: "half"})
	for _, name := range []string{"Shirt front", "Shirt back"} {
		p := pieceNamed(t, ps, name)
		// Every front/back already has a neck curve and an armhole curve (2
		// C's); curveHem would add a third for the shirttail sweep.
		if strings.Count(p.PathData, "C") > 2 {
			t.Errorf("%q should have a straight hem, not a shirttail curve: %s", name, p.PathData)
		}
		if !strings.Contains(p.Notes, "vent") {
			t.Errorf("%q should note the side vent: %s", name, p.Notes)
		}
		vent, ok := p.Landmarks["ventTop"]
		if !ok {
			t.Fatalf("%q should carry a ventTop landmark for the preview to draw", name)
		}
		if vent.Y >= p.Height || vent.Y <= 0 {
			t.Errorf("%q vent top should sit a little above the hem, not at or past it: vent.Y=%.1f height=%.1f", name, vent.Y, p.Height)
		}
	}
	// A regular (non-polo) shirt keeps its curved hem and has no vent.
	reg := pieceNamed(t, DraftShirt(m, ShirtOptions{Collar: true, CollarStyle: "convertible"}), "Shirt front")
	if _, ok := reg.Landmarks["ventTop"]; ok {
		t.Errorf("a non-polo shirt shouldn't have a vent landmark")
	}
}

func TestSleeveFabricTagsSleeveAndCuffOnly(t *testing.T) {
	m := Measurements{Bust: 96, Waist: 84, BackWaistLength: 42, Shoulder: 13, Neck: 38, Ease: 6, SleeveLength: 60, UpperArm: 30, Wrist: 18}
	ps := DraftShirt(m, ShirtOptions{Collar: true, CollarStyle: "convertible", SleeveFabric: "contrast"})
	contrast := map[string]bool{"Sleeve": true, "Cuff": true, "Cuff slit facing": true}
	for _, p := range ps {
		want := contrast[p.Name]
		got := p.Fabric == "contrast"
		if got != want {
			t.Errorf("%q: Fabric=%q, want contrast=%v", p.Name, p.Fabric, want)
		}
	}

	// Left at the default, nothing is tagged — the torso stays the whole
	// story, same as before this option existed.
	def := DraftShirt(m, ShirtOptions{Collar: true, CollarStyle: "convertible"})
	for _, p := range def {
		if p.Fabric == "contrast" {
			t.Errorf("%q shouldn't be contrast fabric without SleeveFabric set", p.Name)
		}
	}

	// A half sleeve has no cuff to tag, but the rib trim should still follow.
	half := DraftShirt(m, ShirtOptions{Collar: true, CollarStyle: "polo", SleeveStyle: "half", SleeveFabric: "contrast"})
	rib := pieceNamed(t, half, "Sleeve rib")
	if rib.Fabric != "contrast" {
		t.Errorf("a polo's sleeve rib should follow SleeveFabric too, got %q", rib.Fabric)
	}
}

func TestPullOnTrousers(t *testing.T) {
	m := Measurements{Waist: 82, Hip: 104, Rise: 28, Inseam: 76, Ease: 4}
	pull := DraftTrousers(m, "Pants", AddOns{}, TrouserOptions{Waist: "elastic"})
	for _, n := range []string{"Belt loop", "Fly facing", "Waistband"} {
		if hasPiece(pull, n) {
			t.Errorf("a pull-on has no %q", n)
		}
	}
	for _, n := range []string{"Waistband (elastic)", "Waist elastic", "Drawstring"} {
		if !hasPiece(pull, n) {
			t.Errorf("a pull-on needs %q", n)
		}
	}
	front := pieceNamed(t, pull, "Pants front")
	if _, ok := front.Landmarks["dart1"]; ok {
		t.Errorf("a pull-on has no darts")
	}
	// The top edge has to pass over the hips: nearly as wide as the seat.
	band := pieceNamed(t, DraftTrousers(m, "Pants", AddOns{}, TrouserOptions{}), "Pants front")
	if front.Landmarks["waistSide"].X-front.Landmarks["waistCF"].X <= band.Landmarks["waistSide"].X-band.Landmarks["waistCF"].X {
		t.Errorf("a pull-on's top edge should be wider than a fitted waist")
	}
}

func TestSideStripe(t *testing.T) {
	m := Measurements{Waist: 82, Hip: 104, Rise: 28, Inseam: 76, Ease: 4}
	if hasPiece(DraftTrousers(m, "Pants", AddOns{}, TrouserOptions{}), "Side stripe") {
		t.Errorf("no stripe unless asked")
	}
	s := pieceNamed(t, DraftTrousers(m, "Pants", AddOns{}, TrouserOptions{Stripe: "side"}), "Side stripe")
	if s.Qty != 2 {
		t.Errorf("one stripe per leg, got %d", s.Qty)
	}
	near(t, "stripe runs the leg", s.Height, 104, 0.1)
}

func TestTrouserDartsHaveWidth(t *testing.T) {
	m := Measurements{Waist: 82, Hip: 104, Rise: 28, Inseam: 76, Ease: 4}
	ps := DraftTrousers(m, "Pants", AddOns{}, TrouserOptions{})
	back := pieceNamed(t, ps, "Pants back")
	if back.Landmarks["dart1w"].X <= 0 || back.Landmarks["dart2w"].X <= 0 {
		t.Errorf("each back dart should say how wide it is: %+v", back.Landmarks)
	}
}

func TestTrouserOptions(t *testing.T) {
	m := Measurements{Waist: 82, Hip: 104, Rise: 28, Inseam: 76, Ease: 4}
	hem := func(o TrouserOptions) float64 {
		f := pieceNamed(t, DraftTrousers(m, "Pants", AddOns{}, o), "Pants front")
		return f.Landmarks["hemSide"].X - f.Landmarks["hemInseam"].X
	}
	if !(hem(TrouserOptions{LegStyle: "slim"}) < hem(TrouserOptions{}) && hem(TrouserOptions{}) < hem(TrouserOptions{LegStyle: "wide"})) {
		t.Errorf("slim < straight < wide expected")
	}
	def := DraftTrousers(m, "Pants", AddOns{}, TrouserOptions{})
	for _, n := range []string{"Belt loop", "Slant pocket bag", "Welt strip", "Welt pocket bag", "Fly facing"} {
		if !hasPiece(def, n) {
			t.Errorf("default trousers should have %q", n)
		}
	}
	bare := DraftTrousers(m, "Pants", AddOns{}, TrouserOptions{BeltLoops: "none", FrontPocket: "none", BackPocket: "none", Fly: "plain"})
	for _, n := range []string{"Belt loop", "Slant pocket bag", "Welt strip", "Welt pocket bag", "Fly facing"} {
		if hasPiece(bare, n) {
			t.Errorf("%q should be dropped by its option", n)
		}
	}
	if !hasPiece(DraftTrousers(m, "Pants", AddOns{}, TrouserOptions{BackPocket: "patch"}), "Patch pocket") {
		t.Errorf("patch back pocket should draft a patch pocket piece")
	}
}

func TestShortsAreShort(t *testing.T) {
	m := Measurements{Waist: 70, Hip: 90, Rise: 26, Inseam: 18, Ease: 4}
	f := pieceNamed(t, DraftTrousers(m, "Shorts", AddOns{}, TrouserOptions{}), "Shorts front")
	if f.Height > 26+20 {
		t.Errorf("shorts panel is %.0fcm long", f.Height)
	}
	// Shorts keep close to the thigh width at the hem instead of tapering.
	near(t, "shorts hem / thigh", (f.Landmarks["hemSide"].X-f.Landmarks["hemInseam"].X)/(f.Landmarks["hipSide"].X-f.Landmarks["crotchPt"].X), 0.92, 0.03)
}

func TestMerchItemsDraftAndFinish(t *testing.T) {
	for _, item := range MerchItems() {
		for _, size := range []string{"small", "", "large"} {
			ps := FinishAll(DraftMerch(MerchOptions{Item: item, Size: size, Pocket: "patch", Bottom: "gusset", Brim: "wide", Shape: "rounded"}))
			if len(ps) == 0 {
				t.Errorf("%s/%s: no pieces", item, size)
			}
			for _, p := range ps {
				if p.Width <= 0 || p.Height <= 0 || p.CutPathData == "" || p.Qty <= 0 || p.Grainline == nil {
					t.Errorf("%s/%s: piece %q is incomplete: %+v", item, size, p.Name, p)
				}
			}
		}
	}
	// A width or height overrides the size preset, and size scales defaults.
	tote := pieceNamed(t, DraftMerch(MerchOptions{Item: "tote_bag", Width: 30, Height: 33}), "Body panel")
	near(t, "custom tote width", tote.Width, 30, 0.05)
	small := pieceNamed(t, DraftMerch(MerchOptions{Item: "tote_bag", Size: "small"}), "Body panel")
	large := pieceNamed(t, DraftMerch(MerchOptions{Item: "tote_bag", Size: "large"}), "Body panel")
	if small.Width >= large.Width {
		t.Errorf("small tote %.1f should be narrower than large %.1f", small.Width, large.Width)
	}
	// A bucket hat's crown circle matches the head circumference.
	hat := DraftMerch(MerchOptions{Item: "bucket_hat", Width: 56})
	near(t, "crown circumference", pieceNamed(t, hat, "Crown top").Width*math.Pi, 56, 0.6)
	if DraftMerch(MerchOptions{Item: "nope"}) != nil {
		t.Errorf("an unknown item should draft nothing")
	}
}

func TestSkirtBlock(t *testing.T) {
	m := Measurements{Waist: 72, Hip: 96, Ease: 6, SkirtLength: 58}
	ps := DraftSkirt(m, AddOns{}, SkirtOptions{})
	front, back := pieceNamed(t, ps, "Skirt front"), pieceNamed(t, ps, "Skirt back")
	fl, bl := front.Landmarks, back.Landmarks

	// Hip line about 20cm down (the adult charts: 18-20cm); the back carries
	// 1.2cm more of the circumference than the front.
	near(t, "hip depth", fl["hipSide"].Y, 20, 1)
	near(t, "back / front hip width", bl["hipSide"].X-fl["hipSide"].X, 1.2, 0.05)

	// Once the darts are closed the waist edge is exactly the waist quarter.
	frontWaist := fl["waistSide"].X - fl["dart1w"].X
	near(t, "front waist after darts", frontWaist, 72.0/4+0.5-0.6, 0.2)
	backWaist := bl["waistSide"].X - bl["dart1w"].X - bl["dart2w"].X
	near(t, "back waist after darts", backWaist, 72.0/4+0.5+0.6, 0.2)
	if _, ok := fl["dart2"]; ok {
		t.Errorf("the front has one dart")
	}
	if bl["dart1"].Y <= fl["dart1"].Y {
		t.Errorf("back darts (%.1f) should be longer than the front's (%.1f)", bl["dart1"].Y, fl["dart1"].Y)
	}
	if bl["dart1w"].X+bl["dart2w"].X <= fl["dart1w"].X {
		t.Errorf("the back takes more in darts than the front")
	}

	// The waist dips toward center front, and the panels stay in positive space.
	if fl["waistCF"].Y <= fl["waistSide"].Y {
		t.Errorf("the front waistline should dip toward center front")
	}
	for _, p := range []Piece{front, back} {
		for _, pt := range pathPoints(p.PathData) {
			if pt.x < -0.05 || pt.y < -0.05 || pt.x > p.Width+0.05 || pt.y > p.Height+0.05 {
				t.Errorf("%s: point %.1f,%.1f outside %.1f x %.1f", p.Name, pt.x, pt.y, p.Width, p.Height)
			}
		}
	}

	// Style: a straight skirt hangs from the hip, the others widen below it.
	hem := func(style string) float64 {
		f := pieceNamed(t, DraftSkirt(m, AddOns{}, SkirtOptions{Style: style}), "Skirt front")
		return f.Landmarks["hemSide"].X
	}
	near(t, "straight hem = hip", hem("straight"), fl["hipSide"].X, 0.05)
	if !(hem("straight") < hem("a_line") && hem("a_line") < hem("flared")) {
		t.Errorf("straight < a-line < flared expected")
	}

	// A pull-on has a casing, no darts and no waistband.
	pull := DraftSkirt(m, AddOns{}, SkirtOptions{Waist: "elastic", Pocket: "side"})
	pf := pieceNamed(t, pull, "Skirt front")
	if _, ok := pf.Landmarks["dart1"]; ok {
		t.Errorf("a pull-on skirt has no darts")
	}
	if _, ok := pf.Landmarks["casing"]; !ok {
		t.Errorf("a pull-on skirt has an elastic casing")
	}
	if hasPiece(pull, "Waistband") || !hasPiece(pull, "Waist elastic") || !hasPiece(pull, "Side pocket bag") {
		t.Errorf("pull-on pieces wrong: %v", pull)
	}
	if !hasPiece(ps, "Waistband") || hasPiece(ps, "Side pocket bag") {
		t.Errorf("the default skirt has a waistband and no pockets")
	}
}

func TestCustomPiecesFromDrawnOutlines(t *testing.T) {
	ps, err := DraftCustom(CustomOptions{Pieces: []CustomPiece{
		{Name: "Front", PathData: "M 10,10 L 30,10 L 30,40 L 10,40 Z", Qty: 2},
		{PathData: "M5,5 C 15,0 25,0 35,5 L35,25 L5,25 Z", FoldEdge: "left", Qty: 0},
	}})
	if err != nil {
		t.Fatal(err)
	}
	near(t, "width", ps[0].Width, 20, 0.05)
	near(t, "height", ps[0].Height, 30, 0.05)
	if !strings.HasPrefix(ps[0].PathData, "M0.0,0.0") {
		t.Errorf("the outline should be moved to the origin: %s", ps[0].PathData)
	}
	if ps[0].Qty != 2 || ps[1].Qty != 1 || ps[1].Name != "Piece 2" || ps[1].FoldEdge != "left" {
		t.Errorf("defaults wrong: %+v %+v", ps[0], ps[1])
	}
	// The curve's top bulges above the corners, so the piece is a little taller than 20.
	if ps[1].Height < 20 || ps[1].Height > 25 {
		t.Errorf("curved piece height %.1f", ps[1].Height)
	}
	// They finish like any other piece: a cutting line and a grainline.
	fin := FinishAll(ps)
	if fin[0].CutPathData == "" || fin[0].Grainline == nil || fin[0].Qty != 2 {
		t.Errorf("custom piece not finished: %+v", fin[0])
	}
	near(t, "cut width = width + 2 seam allowances", fin[0].CutWidth, 22, 0.05)

	bad := map[string]CustomOptions{
		"nothing":    {},
		"two points": {Pieces: []CustomPiece{{PathData: "M0,0 L10,10 Z"}}},
		"tiny":       {Pieces: []CustomPiece{{PathData: "M0,0 L0.5,0 L0.5,0.5 L0,0.5 Z"}}},
		"huge":       {Pieces: []CustomPiece{{PathData: "M0,0 L900,0 L900,900 L0,900 Z"}}},
		"empty path": {Pieces: []CustomPiece{{Name: "x"}}},
	}
	for name, o := range bad {
		if _, err := DraftCustom(o); err == nil {
			t.Errorf("%s should be rejected", name)
		}
	}
}

func TestPenPocketsAndExtrasOnEverySegment(t *testing.T) {
	m := Measurements{Bust: 96, Waist: 84, Hip: 100, Rise: 28, Inseam: 76, Ease: 6, SkirtLength: 55, Neck: 38, Shoulder: 13, SleeveLength: 60, UpperArm: 30, Wrist: 18, BackWaistLength: 42}
	pen := Accessory{ID: "p", Type: "pocket", Segment: SegmentLeftSleeve, Shape: "square", Width: 3.5, Height: 13}
	shirt := DraftShirt(m, ShirtOptions{Collar: true, SleeveStyle: "full", AddOns: AddOns{Accessories: []Accessory{pen}}})
	p := pieceNamed(t, shirt, "Pen pocket — left sleeve")
	near(t, "pen pocket width", p.Width, 3.5, 0.05)
	near(t, "pen pocket height", p.Height, 13, 0.05)
	if p.Segment != SegmentLeftSleeve {
		t.Errorf("the pocket should stay attached to the sleeve, got %q", p.Segment)
	}

	leg := Accessory{ID: "l", Type: "pocket", Segment: SegmentLeftLeg}
	pants := DraftTrousers(m, "Pants", AddOns{Accessories: []Accessory{leg}}, TrouserOptions{})
	pieceNamed(t, pants, "Pocket — left leg")

	front := Accessory{ID: "f", Type: "pocket", Segment: SegmentCenterFront}
	skirt := DraftSkirt(m, AddOns{Accessories: []Accessory{front}}, SkirtOptions{})
	pieceNamed(t, skirt, "Pocket — center front")

	// Prints on the new segments are metadata only and never add a piece.
	prints := []Accessory{{ID: "a", Type: "sablon", Segment: SegmentWaistband}, {ID: "b", Type: "embroidery", Segment: SegmentRightHem}, {ID: "c", Type: "sablon", Segment: SegmentHem}}
	if got, want := len(DraftTrousers(m, "Pants", AddOns{Accessories: prints}, TrouserOptions{})), len(DraftTrousers(m, "Pants", AddOns{}, TrouserOptions{})); got != want {
		t.Errorf("prints changed the piece count: %d vs %d", got, want)
	}
}

func TestDesignFeaturesFromRealUniforms(t *testing.T) {
	m := Measurements{Bust: 96, Waist: 84, BackWaistLength: 42, Shoulder: 13, Neck: 38, Ease: 6, SleeveLength: 60, UpperArm: 30, Wrist: 18, Hip: 100}
	round := pieceNamed(t, DraftShirt(m, ShirtOptions{}), "Shirt front")

	// A V-neck: the neckline is straight lines from the neck point to a low center front.
	v := DraftShirt(m, ShirtOptions{Neckline: "v_neck", SleeveStyle: "three_quarter"})
	front := pieceNamed(t, v, "Shirt front")
	if !regexp.MustCompile(`^M0\.0,\S+ L\S+ L\S+ C`).MatchString(front.PathData) || !strings.HasSuffix(front.PathData, "L0.0,20.8 Z") {
		t.Errorf("a V-neck front should start with two straight lines and close at the V: %s", front.PathData)
	}
	pts := pathPoints(front.PathData)
	near(t, "V depth is deep (about 0.85 x armhole)", pts[0].y, shirtScye(96)*vNeckDepthFactor, 0.3)
	near(t, "the V ends at the neck point", pts[1].y, 0, 0.05)
	if hasPiece(v, "Collar leaf") || !hasPiece(v, "Neck facing") || !hasPiece(v, "Placket") {
		t.Errorf("a V-neck has a facing and an opening but no collar")
	}
	near(t, "placket starts at the V", pieceNamed(t, v, "Placket").Height, front.Height-pts[0].y, 0.2)
	_ = round
	trimmed := DraftShirt(m, ShirtOptions{Neckline: "v_neck", Trim: "contrast"})
	if !hasPiece(trimmed, "Neck trim") || hasPiece(trimmed, "Neck facing") {
		t.Errorf("a contrast trim replaces the facing")
	}
	// A collar with contrast trim gets piping; a hidden placket is named so the drawing can tell.
	piped := DraftShirt(m, ShirtOptions{Collar: true, CollarStyle: "standing", Trim: "contrast", FrontStyle: "hidden_placket"})
	if !hasPiece(piped, "Piping strip") || !hasPiece(piped, "Hidden placket") || hasPiece(piped, "Placket") {
		t.Errorf("piping and hidden placket pieces missing")
	}

	// An insert panel splits one half of the front into three that add up to it.
	pan := DraftShirt(m, ShirtOptions{Collar: true, CollarStyle: "standing", Panel: "side"})
	area := func(p Piece) float64 { return polygonArea(flattenPath(p.PathData)) }
	whole := area(pieceNamed(t, pan, "Shirt front"))
	sum := area(pieceNamed(t, pan, "Front inner (panel side)")) + area(pieceNamed(t, pan, "Insert panel")) + area(pieceNamed(t, pan, "Front outer (panel side)"))
	near(t, "the three parts add up to the front half", sum, whole, whole*0.005)
	if pieceNamed(t, pan, "Shirt front").Qty != 1 {
		t.Errorf("only the plain half of the front is cut whole")
	}
	if off := pieceNamed(t, pan, "Insert panel").Landmarks["offset"]; off.X <= 0 {
		t.Errorf("the panel should remember where it sits on the front")
	}
}
