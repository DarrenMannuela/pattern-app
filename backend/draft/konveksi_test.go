package draft

import (
	"fmt"
	"math"
	"strings"
	"testing"
)

func konveksiOpts() ShirtOptions {
	return ShirtOptions{Block: BlockKonveksi, Collar: true, CollarStyle: "standing", FrontStyle: "hidden_placket", BackStyle: "plain", HemStyle: "straight", SleeveStyle: "half"}
}

func finishedOf(s Summary, key string) float64 {
	for _, f := range s.Finished {
		if f.Key == key {
			return f.CM
		}
	}
	return math.NaN()
}

// Size M is Dad's paper pattern, measured with the seam allowances off: the
// chest from the finished uniform (49 laid flat), the rest off the paper.
func TestKonveksiSizeMIsTheShopPattern(t *testing.T) {
	ps := DraftShirtSize("M", Measurements{}, konveksiOpts())
	s := Summarize(ps, Measurements{})
	near(t, "chest", finishedOf(s, "chest"), 98, 0.2)
	near(t, "hem (straight sides)", finishedOf(s, "hem"), 98, 0.2)
	near(t, "shoulder width", finishedOf(s, "shoulder"), 47.7, 0.6)
	near(t, "sleeve width", finishedOf(s, "bicep"), 44.5, 0.2)
	near(t, "sleeve hem", finishedOf(s, "opening"), 39.5, 0.2)
	near(t, "sleeve length", finishedOf(s, "sleeve"), 26, 0.4)

	front, back, sleeve := pieceNamed(t, ps, "Shirt front"), pieceNamed(t, ps, "Shirt back"), pieceNamed(t, ps, "Sleeve")
	cb := back.Landmarks["hemCentre"].Y - kBackNeckM
	near(t, "back length, back neck to hem", cb, 72, 0.2)
	near(t, "half back", back.Landmarks["underarm"].X, 26.5, 0.1)
	near(t, "front, centre front to side", front.Landmarks["underarm"].X, 22.5, 0.1)
	near(t, "neck point to underarm, front", front.Landmarks["underarm"].Y, 22.4, 0.1)
	near(t, "neck point to underarm, back", back.Landmarks["underarm"].Y, 26.7, 0.1)
	near(t, "front shoulder drop", front.Landmarks["shoulderTip"].Y, 3.3, 0.1)
	near(t, "back shoulder drop", back.Landmarks["shoulderTip"].Y, 2.1, 0.1)
	cap := sleeve.Landmarks["backUnderarm"].Y
	if cap < 6.5 || cap > 9 {
		t.Errorf("sleeve cap height %.1f, want about 7.5 (Dad's 8 as cut)", cap)
	}

	// The front opens: 2.5 past centre front plus a 2.5 facing, and the lidah.
	if front.Qty != 2 || front.FoldEdge != "" {
		t.Errorf("front cut %d, fold %q: want a left and a right front", front.Qty, front.FoldEdge)
	}
	near(t, "front edge past centre front", -pathMinX(t, front.PathData), kOverlap+kFacing, 0.05)
	lidah := pieceNamed(t, ps, "Hidden placket")
	near(t, "lidah width", lidah.Width, 3.2, 0.01)

	collar, inner := pieceNamed(t, ps, "Standing collar"), pieceNamed(t, ps, "Collar interfacing")
	near(t, "collar height", collar.Height, 5.5, 0.3) // 4 high at the front, which lifts 1.5: above the back's 5.1
	if !inner.NoAllowance || inner.Width > collar.Width-1.5 {
		t.Errorf("interfacing: no allowance %v, %.1f long on a %.1f collar: want cut to size, 2cm short", inner.NoAllowance, inner.Width, collar.Width)
	}

	// Dad's allowances: 0.5 seams, a 1.5 hem, 2.5 on the sleeve hem.
	if front.SeamAllow != 0.5 || front.HemAllow != 1.5 || sleeve.HemAllow != 2.5 {
		t.Errorf("allowances: seam %.1f, hem %.1f, sleeve hem %.1f", front.SeamAllow, front.HemAllow, sleeve.HemAllow)
	}
}

func pathMinX(t *testing.T, d string) float64 {
	t.Helper()
	poly := flattenPath(d)
	if len(poly) == 0 {
		t.Fatal("empty path")
	}
	m := poly[0].x
	for _, p := range poly {
		m = math.Min(m, p.x)
	}
	return m
}

// Each size up is 3cm wider laid flat (6 round); the rest grows with it.
func TestKonveksiChartGrades(t *testing.T) {
	chest := func(label string, o KonveksiOptions) float64 {
		opts := konveksiOpts()
		opts.Konveksi = o
		return finishedOf(Summarize(DraftShirtSize(label, Measurements{}, opts), Measurements{}), "chest")
	}
	for label, want := range map[string]float64{"XS": 86, "S": 92, "M": 98, "L": 104, "XL": 110, "XXL": 116, "3XL": 122} {
		near(t, label+" chest", chest(label, KonveksiOptions{}), want, 0.2)
	}
	// Re-anchored: L given a 100 chest, every size follows.
	o := KonveksiOptions{BaseSize: "L", Chest: 100}
	near(t, "re-anchored L", chest("L", o), 100, 0.2)
	near(t, "re-anchored M", chest("M", o), 94, 0.2)
	near(t, "re-anchored XL", chest("XL", o), 106, 0.2)
	// The length is given at the side neck point, as the app measures it.
	opts := konveksiOpts()
	opts.Konveksi = KonveksiOptions{BaseSize: "M", Length: 75}
	near(t, "re-anchored length", finishedOf(Summarize(DraftShirtSize("M", Measurements{}, opts), Measurements{}), "length"), 75, 0.1)
	near(t, "chart M length", KonveksiChart(KonveksiOptions{})[2].Length, 73.2, 0.05)

	rows := KonveksiChart(KonveksiOptions{})
	for i := 1; i < len(rows); i++ {
		a, b := rows[i-1], rows[i]
		near(t, b.Size+" length step", b.Length-a.Length, 1.5, 0.15) // 1.5, plus the back neck's 0.05 and rounding
		near(t, b.Size+" shoulder step", b.Shoulder-a.Shoulder, 1.5, 0.3)
		near(t, b.Size+" sleeve width step", b.SleeveWidth-a.SleeveWidth, 1.5, 0.05)
	}
	// A size off the chart is placed by the person's chest plus 6cm of room.
	opts = konveksiOpts()
	measured := Summarize(DraftShirtSize("Budi", Measurements{Bust: 100}, opts), Measurements{})
	near(t, "measured person, 100 chest", finishedOf(measured, "chest"), 106, 0.3)
}

// Every chart size sews: every seam check the app makes on a shirt passes.
func TestKonveksiEverySizeSews(t *testing.T) {
	for _, label := range []string{"3XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "7XL"} {
		for _, sleeve := range []string{"half", "full"} {
			opts := konveksiOpts()
			opts.SleeveStyle = sleeve
			ps := FinishAll(DraftShirtSize(label, Measurements{}, opts))
			s := Summarize(ps, Measurements{})
			if len(s.Checks) == 0 {
				t.Fatalf("%s %s: no checks ran", label, sleeve)
			}
			for _, c := range s.Checks {
				if !c.OK {
					t.Errorf("%s %s sleeve: %s: %s", label, sleeve, c.Label, c.Detail)
				}
			}
			for _, p := range ps {
				if p.CutPathData == "" {
					t.Errorf("%s: %q has no cutting line", label, p.Name)
				}
			}
		}
	}
}

// A size whose hip is wider than its hem gets flared side seams; the rest
// keep Dad's straight sides. Every seam check still passes, at any hip.
func TestKonveksiFlaresForAWideHip(t *testing.T) {
	plain := Summarize(DraftShirtSize("S", Measurements{}, konveksiOpts()), Measurements{})
	near(t, "S hem with no hip given", finishedOf(plain, "hem"), 92, 0.2)
	narrow := Measurements{Hip: 88}
	s := Summarize(DraftShirtSize("S", narrow, konveksiOpts()), narrow)
	near(t, "S hem, hip 88 (fits already)", finishedOf(s, "hem"), 92, 0.2)
	for _, hip := range []float64{98, 110, 125} {
		for _, hem := range []string{"straight", "curved"} {
			m := Measurements{Bust: 86, Hip: hip}
			opts := konveksiOpts()
			opts.HemStyle = hem
			s := Summarize(FinishAll(DraftShirtSize("S", m, opts)), m)
			near(t, fmt.Sprintf("S hem for a %.0f hip (%s)", hip, hem), finishedOf(s, "hem"), hip+2, 0.3)
			near(t, "chest unchanged", finishedOf(s, "chest"), 92, 0.2)
			for _, c := range s.Checks {
				if !c.OK {
					t.Errorf("hip %.0f, %s hem: %s: %s", hip, hem, c.Label, c.Detail)
				}
			}
		}
	}
}

// The side panel sits as on the shop's uniform: a strip from the shoulder to
// the hem, clear of the armhole, with the front opening kept on its inner piece.
func TestKonveksiSidePanelClearsTheArmhole(t *testing.T) {
	for _, blk := range []string{BlockKonveksi, ""} {
		for _, label := range []string{"XS", "M", "3XL"} {
			opts := konveksiOpts()
			opts.Block, opts.Panel = blk, "side"
			ps := DraftShirtSize(label, Measurements{}, opts)
			front, panel := pieceNamed(t, ps, "Shirt front"), pieceNamed(t, ps, "Insert panel")
			inner, outer := pieceNamed(t, ps, "Front inner (panel side)"), pieceNamed(t, ps, "Front outer (panel side)")
			edge := panel.Landmarks["offset"].X + panel.Width
			armIn := math.Inf(1)
			for _, p := range flattenPath(front.PathData) {
				if p.y > front.Landmarks["shoulderTip"].Y && p.y < front.Landmarks["underarm"].Y && p.x > front.Landmarks["neckPoint"].X {
					armIn = math.Min(armIn, p.x)
				}
			}
			if armIn-edge < 1.9 {
				t.Errorf("%q %s: panel edge %.1f is %.1f from the armhole", blk, label, edge, armIn-edge)
			}
			if panel.Width < 5 || panel.Height < front.Height-6 {
				t.Errorf("%q %s: panel %.1f wide, %.1f long on a %.1f front: want a strip shoulder to hem", blk, label, panel.Width, panel.Height, front.Height)
			}
			if outer.Landmarks["offset"].Y > front.Landmarks["shoulderTip"].Y {
				t.Errorf("%q %s: the outer piece should run from the shoulder (starts at %.1f)", blk, label, outer.Landmarks["offset"].Y)
			}
			near(t, "inner piece starts at the front edge", inner.Landmarks["offset"].X+pathMinX(t, inner.PathData), pathMinX(t, front.PathData), 0.1)
		}
	}
}

// The shop cuts its backs and collars as whole pieces, so the cutting line is
// the full outline, twice the half's width, with nothing on a fold.
func TestKonveksiBackAndCollarsCutWhole(t *testing.T) {
	for _, label := range []string{"XS", "M", "3XL"} {
		for _, sleeve := range []string{"half", "full"} {
			opts := konveksiOpts()
			opts.SleeveStyle = sleeve
			raw := DraftShirtSize(label, Measurements{}, opts)
			done := FinishAll(raw)
			for i, p := range done {
				if !raw[i].CutFull {
					continue
				}
				if !p.CutFull {
					t.Errorf("%s %s: %s couldn't be unfolded", label, sleeve, p.Name)
					continue
				}
				half := Finish(Piece{Name: raw[i].Name, PathData: raw[i].PathData, FoldEdge: "left", SeamAllow: raw[i].SeamAllow, HemAllow: raw[i].HemAllow, NoAllowance: raw[i].NoAllowance})
				near(t, label+" "+p.Name+" width", p.CutWidth, 2*half.CutWidth, 0.15)
				near(t, label+" "+p.Name+" height", p.CutHeight, half.CutHeight, 0.05)
				// The outline doesn't run along the old fold.
				poly := flattenPath(p.CutPathData)
				mid := p.CutWidth / 2
				for j := range poly {
					a, b := poly[j], poly[(j+1)%len(poly)]
					if math.Abs(a.x-mid) < 0.05 && math.Abs(b.x-mid) < 0.05 && math.Abs(a.y-b.y) > 1 {
						t.Errorf("%s %s: a line down the centre", label, p.Name)
					}
				}
			}
			back := pieceNamed(t, done, "Shirt back")
			if !back.CutFull || back.Qty != 1 {
				t.Errorf("%s back: cut full %v, qty %d; want one whole back", label, back.CutFull, back.Qty)
			}
			if c := pieceNamed(t, done, "Standing collar"); c.Qty != 2 {
				t.Errorf("%s collar qty %d, want 2 (outer and lining)", label, c.Qty)
			}
			if c := pieceNamed(t, done, "Collar interfacing"); c.Qty != 1 {
				t.Errorf("%s interfacing qty %d, want 1", label, c.Qty)
			}
		}
	}
}

// Every collar, in either block and every style, is cut as one whole piece.
func TestEveryCollarCutWhole(t *testing.T) {
	for _, block := range []string{"", BlockKonveksi} {
		// (A polo collar is a full-length strip doubled along its length.)
		for _, style := range []string{"standing", "convertible", "point", "spread", "peter_pan"} {
			opts := konveksiOpts()
			opts.Block, opts.CollarStyle = block, style
			raw := DraftShirtSize("M", Measurements{}, opts)
			found := 0
			for i, p := range FinishAll(raw) {
				if !strings.Contains(strings.ToLower(p.Name), "collar") {
					continue
				}
				found++
				half := Finish(Piece{Name: raw[i].Name, PathData: raw[i].PathData, FoldEdge: "left", SeamAllow: raw[i].SeamAllow, HemAllow: raw[i].HemAllow, NoAllowance: raw[i].NoAllowance})
				near(t, fmt.Sprintf("%q %s %s width", block, style, p.Name), p.CutWidth, 2*half.CutWidth, 0.3)
				near(t, fmt.Sprintf("%q %s %s height", block, style, p.Name), p.CutHeight, half.CutHeight, 0.3)
				if !p.CutFull {
					t.Errorf("block %q %s: %s is still a half on the fold", block, style, p.Name)
				}
				if strings.Contains(strings.ToLower(p.Notes), "on fold") || strings.Contains(strings.ToLower(p.Notes), "on the fold") {
					t.Errorf("block %q %s: %s notes still say fold: %s", block, style, p.Name, p.Notes)
				}
				if cutLabelQty := p.Qty; cutLabelQty < 1 {
					t.Errorf("%s qty %d", p.Name, p.Qty)
				}
			}
			if found == 0 {
				t.Errorf("block %q %s: no collar pieces", block, style)
			}
		}
	}
}
