package draft

import (
	"math"
	"testing"
)

func areaOf(d string) float64 {
	poly := flattenPath(d)
	a := 0.0
	for i := range poly {
		p, q := poly[i], poly[(i+1)%len(poly)]
		a += p.x*q.y - q.x*p.y
	}
	return math.Abs(a) / 2
}

func byName(pieces []Piece, name string) *Piece {
	for i := range pieces {
		if pieces[i].Name == name {
			return &pieces[i]
		}
	}
	return nil
}

func TestColorBlockSplitsTheFrontIntoTwoFabrics(t *testing.T) {
	m := Measurements{Bust: 92, Waist: 80, Neck: 37, Shoulder: 13}
	plain := DraftShirt(m, ShirtOptions{Collar: true, SleeveStyle: "half"})
	for _, style := range []string{"straight", "v"} {
		blocked := DraftShirt(m, ShirtOptions{Collar: true, SleeveStyle: "half", ColorBlock: style})
		whole := byName(plain, "Shirt front")
		lower, upper := byName(blocked, "Shirt front"), byName(blocked, "Upper front")
		if lower == nil || upper == nil {
			t.Fatalf("%s: missing a part", style)
		}
		if upper.Fabric != "contrast" || lower.Fabric == "contrast" {
			t.Errorf("%s: fabrics upper %q lower %q", style, upper.Fabric, lower.Fabric)
		}
		if upper.Qty != whole.Qty || lower.Qty != whole.Qty || upper.FoldEdge != whole.FoldEdge {
			t.Errorf("%s: parts must be cut like the front (qty %d, fold %q)", style, whole.Qty, whole.FoldEdge)
		}
		if a, b, w := areaOf(upper.PathData), areaOf(lower.PathData), areaOf(whole.PathData); math.Abs(a+b-w) > 1 {
			t.Errorf("%s: parts %.0f + %.0f cm² don't make the front's %.0f cm²", style, a, b, w)
		}
		if lower.Outline != whole.PathData {
			t.Errorf("%s: the drawing needs the whole front's outline", style)
		}
		cf, arm := lower.Landmarks["blockCF"], lower.Landmarks["blockArm"]
		if style == "v" && cf.Y-arm.Y < 5 {
			t.Errorf("a V block should dip at centre front: CF %.1f, armhole %.1f", cf.Y, arm.Y)
		}
		if style == "straight" && math.Abs(cf.Y-arm.Y) > 0.1 {
			t.Errorf("a straight block should be level: CF %.1f, armhole %.1f", cf.Y, arm.Y)
		}
		// The back's yoke becomes the block at the back.
		if y := byName(blocked, "Yoke"); y == nil || y.Fabric != "contrast" {
			t.Errorf("%s: the back yoke should be in the contrast fabric", style)
		}
	}
}

func TestColorBlockOnAPlainBackSplitsTheBack(t *testing.T) {
	m := Measurements{Bust: 92, Waist: 80, Neck: 37, Shoulder: 13}
	pieces := DraftShirt(m, ShirtOptions{Collar: true, BackStyle: "plain", ColorBlock: "straight"})
	if byName(pieces, "Upper back") == nil || byName(pieces, "Upper back").Fabric != "contrast" {
		t.Fatal("a plain back should get its own upper block")
	}
}

// The block line is a seam: 1cm allowance, not the 2cm+ a shirt hem takes.
func TestColorBlockEdgeIsASeamNotAHem(t *testing.T) {
	if got := hemAllowanceFor("Upper front"); got != seamAllowance {
		t.Errorf("upper front edge allowance %.1f, want the seam allowance %.1f", got, seamAllowance)
	}
}
