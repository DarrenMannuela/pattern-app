package draft

import (
	"math"
	"regexp"
	"strconv"
	"testing"
)

var numRe = regexp.MustCompile(`-?\d+\.?\d*`)

// firstCurve returns the start point and the first cubic of a path.
func firstCurve(t *testing.T, d string) (start, c1, c2, end [2]float64) {
	t.Helper()
	m := regexp.MustCompile(`^M([^C]*)C([^LCZ]*)`).FindStringSubmatch(d)
	if m == nil {
		t.Fatalf("no leading curve in %q", d)
	}
	nums := func(s string) []float64 {
		var out []float64
		for _, x := range numRe.FindAllString(s, -1) {
			v, _ := strconv.ParseFloat(x, 64)
			out = append(out, v)
		}
		return out
	}
	s, c := nums(m[1]), nums(m[2])
	return [2]float64{s[0], s[1]}, [2]float64{c[0], c[1]}, [2]float64{c[2], c[3]}, [2]float64{c[4], c[5]}
}

// Every neckline leaves the centre line square to it and reaches the side
// neck point square to the shoulder: the mirrored halves join smoothly (no
// notch at centre front or back) and the collar sits flat.
func TestNecklinesAreSquareAtCentreAndShoulder(t *testing.T) {
	m := Measurements{Bust: 92, Waist: 78, Neck: 37, Shoulder: 13}
	check := func(name, d string) {
		start, c1, c2, end := firstCurve(t, d)
		if start[0] != 0 {
			t.Fatalf("%s: neckline doesn't start on the centre line: %v", name, start)
		}
		if math.Abs(c1[1]-start[1]) > 0.05 || c1[0] <= 0.5 {
			t.Errorf("%s: leaves the centre line at an angle (start %v, control %v)", name, start, c1)
		}
		if math.Abs(c2[0]-end[0]) > 0.05 || c2[1] <= end[1] {
			t.Errorf("%s: doesn't rise square into the neck point (control %v, end %v)", name, c2, end)
		}
	}
	for _, p := range DraftShirt(m, ShirtOptions{Collar: true, CollarStyle: "convertible", BackStyle: "yoke"}) {
		if p.Name == "Yoke" || p.Name == "Shirt front" {
			check(p.Name, p.PathData)
		}
	}
	for _, p := range DraftShirt(m, ShirtOptions{BackStyle: "plain"}) {
		if p.Name == "Shirt back" {
			check("plain back", p.PathData)
		}
	}
}

// A front that buttons all the way down is cut as a left and a right front,
// with a seam allowance at centre front for the placket; a pullover front is
// one piece on the fold.
func TestOpenFrontsAreNotCutOnTheFold(t *testing.T) {
	m := Measurements{Bust: 92, Waist: 78, Neck: 37, Shoulder: 13}
	front := func(opts ShirtOptions) Piece {
		for _, p := range FinishAll(DraftShirt(m, opts)) {
			if p.Name == "Shirt front" {
				return p
			}
		}
		t.Fatal("no front")
		return Piece{}
	}
	for _, style := range []string{"", "placket", "hidden_placket"} {
		f := front(ShirtOptions{Collar: true, FrontStyle: style})
		if f.FoldEdge != "" || f.Qty != 2 {
			t.Errorf("front style %q: fold %q qty %d, want a cut-2 pair", style, f.FoldEdge, f.Qty)
		}
		if f.CutOffset == nil || f.CutOffset.X < 0.9 {
			t.Errorf("front style %q: no seam allowance at centre front (offset %+v)", style, f.CutOffset)
		}
	}
	for _, style := range []string{"plain", "half_placket"} {
		if f := front(ShirtOptions{Collar: true, FrontStyle: style}); f.FoldEdge != "left" {
			t.Errorf("pullover front %q should be on the fold, got %q", style, f.FoldEdge)
		}
	}
	if f := front(ShirtOptions{}); f.FoldEdge != "left" {
		t.Errorf("a collarless round-neck front is a pullover, got fold %q", f.FoldEdge)
	}
}
