// Package draft generates basic bodice pattern pieces (front and back
// "sloper" blocks) from body measurements, using standard proportional
// pattern-drafting rules of thumb — the same kind of formulas taught in
// home-sewing and patternmaking courses (e.g. "armhole depth ≈ bust/4 +
// a fixed allowance", "neck width ≈ neck circumference / 5").
//
// IMPORTANT: these are simplified approximations for a rough sloper,
// not a professionally fitted block. Real patternmaking refines these
// with a muslin/toile fitting on an actual body or dress form — treat
// this as a solid starting shape, not a finished pattern.
package draft

import (
	"fmt"
	"math"
	"strings"
)

// Measurements are the body measurements needed to draft a basic
// bodice block, all in centimeters.
type Measurements struct {
	Bust            float64 `json:"bust"`
	Waist           float64 `json:"waist"`
	BackWaistLength float64 `json:"backWaistLength"` // nape to waist
	Shoulder        float64 `json:"shoulder"`        // shoulder seam length
	Neck            float64 `json:"neck"`            // neck circumference
	Ease            float64 `json:"ease"`            // total wearing ease added to bust/waist
}

// Defaults returns m with any zero-valued field replaced by a
// plausible average adult measurement. Exported so other packages
// (like grading, which needs to anchor a base size's measurements
// before applying per-size deltas) can reuse the same fallback
// values as DraftBodice itself, instead of grading zeroes.
func Defaults(m Measurements) Measurements {
	return m.withDefaults()
}

// defaults fills in plausible average adult measurements for any
// field left at zero, so the endpoint still produces a sensible
// shape if the caller only provides a few values.
func (m Measurements) withDefaults() Measurements {
	if m.Bust == 0 {
		m.Bust = 90
	}
	if m.Waist == 0 {
		m.Waist = 72
	}
	if m.BackWaistLength == 0 {
		m.BackWaistLength = 40
	}
	if m.Shoulder == 0 {
		m.Shoulder = 12.5
	}
	if m.Neck == 0 {
		m.Neck = 36
	}
	if m.Ease == 0 {
		m.Ease = 6
	}
	return m
}

// Piece is a single drafted pattern piece: a real curved outline
// (as an SVG path) rather than a bounding box.
type Piece struct {
	Name     string  `json:"name"`
	PathData string  `json:"pathData"` // SVG path 'd' attribute, local coords, origin top-left
	Width    float64 `json:"width"`    // bounding box, for nesting/yardage estimates
	Height   float64 `json:"height"`
	FoldEdge string  `json:"foldEdge"` // "left" if that edge is placed on the fabric fold
	Notes    string  `json:"notes"`
}

type point struct{ x, y float64 }

func round1(v float64) float64 {
	return math.Round(v*10) / 10
}

type pathBuilder struct{ b strings.Builder }

func (pb *pathBuilder) moveTo(p point) *pathBuilder {
	fmt.Fprintf(&pb.b, "M%.1f,%.1f ", p.x, p.y)
	return pb
}
func (pb *pathBuilder) lineTo(p point) *pathBuilder {
	fmt.Fprintf(&pb.b, "L%.1f,%.1f ", p.x, p.y)
	return pb
}
func (pb *pathBuilder) curveTo(c1, c2, p point) *pathBuilder {
	fmt.Fprintf(&pb.b, "C%.1f,%.1f %.1f,%.1f %.1f,%.1f ", c1.x, c1.y, c2.x, c2.y, p.x, p.y)
	return pb
}
func (pb *pathBuilder) close() *pathBuilder {
	pb.b.WriteString("Z")
	return pb
}
func (pb *pathBuilder) String() string { return strings.TrimSpace(pb.b.String()) }

// clamp keeps a dart intake (or similar derived value) within a
// sane, always-sewable range regardless of unusual input measurements.
func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// DartPositions lists the classic preset dart-rotation targets this
// package supports for the bodice front. This mirrors the "rotate the
// dart around the bust point" exercise taught in basic patternmaking:
// the dart is a fixed wedge of angle that can be relocated anywhere
// around the apex without changing how much fabric it takes in.
var DartPositions = []string{"waist", "side", "french", "shoulder", "armhole", "neckline"}

func validDartPosition(pos string) string {
	for _, p := range DartPositions {
		if p == pos {
			return pos
		}
	}
	return "waist"
}

// DraftBodice returns the front and back bodice pieces for the given
// measurements, as a two-element slice: [front, back]. dartPosition
// selects where the front bust dart is rotated to (see DartPositions);
// an empty or unrecognized value falls back to "waist". The back
// piece's small waist dart is not rotatable — there's no bust curve
// on the back to justify moving it.
func DraftBodice(m Measurements, dartPosition string) []Piece {
	m = m.withDefaults()
	dartPosition = validDartPosition(dartPosition)

	ease := m.Ease
	qBust := m.Bust/4 + ease/4   // quarter-bust, the classic drafting unit
	qWaist := m.Waist/4 + ease/4 // quarter-waist
	scye := m.Bust/4 + 2.5       // "scye depth" — armhole depth below the neck/shoulder line
	neckW := m.Neck / 5

	front := draftFront(qBust, qWaist, scye, neckW, m.Shoulder, m.BackWaistLength, dartPosition)
	back := draftBack(qBust, qWaist, scye, neckW, m.Shoulder, m.BackWaistLength)
	return []Piece{front, back}
}

// --- small vector helpers for the dart-rotation geometry ---

func sub(a, b point) point           { return point{a.x - b.x, a.y - b.y} }
func add(a, b point) point           { return point{a.x + b.x, a.y + b.y} }
func scale(a point, s float64) point { return point{a.x * s, a.y * s} }
func lerp(a, b point, t float64) point {
	return add(a, scale(sub(b, a), t))
}
func dot(a, b point) float64 { return a.x*b.x + a.y*b.y }

// rotate turns vector v by angle radians (standard 2D rotation matrix).
func rotate(v point, angle float64) point {
	s, c := math.Sin(angle), math.Cos(angle)
	return point{v.x*c - v.y*s, v.x*s + v.y*c}
}

// dartLegsAt computes the two dart-leg endpoints for a dart pivoting
// at apex A, centered on target point T, with total wedge angle theta.
// Both legs sit at distance |T-A| from A (a "true" dart with equal
// leg lengths) — this is the actual mechanic of dart rotation: cut
// from T to the apex, and the same angle that used to be at the old
// dart position opens up here.
func dartLegsAt(apex, target point, theta float64) (point, point) {
	v := sub(target, apex)
	leg1 := add(apex, rotate(v, theta/2))
	leg2 := add(apex, rotate(v, -theta/2))
	return leg1, leg2
}

// orderAlong returns (p1,p2) reordered so the first point is the one
// that comes first when travelling in direction dir — needed because
// a dart's two legs must be spliced into the boundary in the correct
// order regardless of which edge (and which direction) they sit on.
func orderAlong(p1, p2, dir point) (point, point) {
	if dot(p1, dir) <= dot(p2, dir) {
		return p1, p2
	}
	return p2, p1
}

// splitCubic performs an exact De Casteljau subdivision of a cubic
// bezier at parameter t, returning the control points of the two
// resulting sub-curves: (p0,a,d,f) and (f,e,c,p3). This is used to
// insert a dart mid-curve (on the neckline or armhole) while keeping
// the curve's original shape and tangents intact everywhere except
// the small notch itself.
func splitCubic(p0, p1, p2, p3 point, t float64) (a, d, f, e, c point) {
	a = lerp(p0, p1, t)
	b := lerp(p1, p2, t)
	c = lerp(p2, p3, t)
	d = lerp(a, b, t)
	e = lerp(b, c, t)
	f = lerp(d, e, t) // point on the curve at parameter t
	return
}

func draftFront(qBust, qWaist, scye, neckW, shoulderLen, backWaistLen float64, dartPosition string) Piece {
	height := backWaistLen + 1.5 // front block runs slightly longer than back, for the bust curve
	neckDrop := neckW + 1.5
	shoulderDrop := 2.0
	shoulderTipX := neckW + shoulderLen*0.94

	width := math.Max(qBust, shoulderTipX)

	// The dart's angular "value" is derived once from the bust/waist
	// difference (unchanged regardless of where the dart ends up) —
	// rotating it elsewhere doesn't change how much fabric it takes in.
	dartIntake := clamp(qBust-qWaist-1.5, 0.5, 4)
	apexX := clamp(qBust*0.55, 0, qWaist*0.9)
	apex := point{round1(apexX), round1(scye + (height-scye)*0.42)}
	refDist := height - apex.y // original apex-to-waistline distance, used as the angle's reference arm
	theta := 2 * math.Atan((dartIntake/2)/refDist)

	cfTop := point{0, round1(neckDrop)}
	neckPoint := point{round1(neckW), 0}
	shoulderTip := point{round1(shoulderTipX), round1(shoulderDrop)}
	underarm := point{round1(qBust), round1(scye)}
	sideWaist := point{round1(qWaist), round1(height)}
	cfBottom := point{0, round1(height)}

	// Neckline curve control points (cfTop -> neckPoint).
	nc1 := point{round1(cfTop.x), round1(neckDrop * 0.4)}
	nc2 := point{round1(neckW * 0.55), round1(neckDrop * 0.12)}
	// Armhole curve control points (shoulderTip -> underarm).
	ac1 := point{round1(shoulderTip.x + (underarm.x-shoulderTip.x)*0.25 + 1.5), round1(shoulderTip.y + (underarm.y-shoulderTip.y)*0.15)}
	ac2 := point{round1(underarm.x + 1.2), round1(underarm.y - (underarm.y-shoulderTip.y)*0.3)}

	pb := &pathBuilder{}
	pb.moveTo(cfTop)

	// --- neckline segment ---
	if dartPosition == "neckline" {
		a, d, f, e, c := splitCubic(cfTop, nc1, nc2, neckPoint, 0.5)
		leg1, leg2 := dartLegsAt(apex, f, theta)
		first, second := orderAlong(leg1, leg2, sub(neckPoint, cfTop))
		pb.curveTo(a, d, first).lineTo(apex).lineTo(second).curveTo(e, c, neckPoint)
	} else {
		pb.curveTo(nc1, nc2, neckPoint)
	}

	// --- shoulder segment ---
	if dartPosition == "shoulder" {
		target := lerp(neckPoint, shoulderTip, 0.4) // typical shoulder-dart placement, closer to the neck
		leg1, leg2 := dartLegsAt(apex, target, theta)
		first, second := orderAlong(leg1, leg2, sub(shoulderTip, neckPoint))
		pb.lineTo(first).lineTo(apex).lineTo(second).lineTo(shoulderTip)
	} else {
		pb.lineTo(shoulderTip)
	}

	// --- armhole segment ---
	if dartPosition == "armhole" {
		a, d, f, e, c := splitCubic(shoulderTip, ac1, ac2, underarm, 0.5)
		leg1, leg2 := dartLegsAt(apex, f, theta)
		first, second := orderAlong(leg1, leg2, sub(underarm, shoulderTip))
		pb.curveTo(a, d, first).lineTo(apex).lineTo(second).curveTo(e, c, underarm)
	} else {
		pb.curveTo(ac1, ac2, underarm)
	}

	// --- side seam segment ---
	if dartPosition == "side" || dartPosition == "french" {
		t := 0.5
		if dartPosition == "french" {
			t = 0.78 // lower down the side seam, angled toward the bust — the classic "French dart"
		}
		target := lerp(underarm, sideWaist, t)
		leg1, leg2 := dartLegsAt(apex, target, theta)
		first, second := orderAlong(leg1, leg2, sub(sideWaist, underarm))
		pb.lineTo(first).lineTo(apex).lineTo(second).lineTo(sideWaist)
	} else {
		pb.lineTo(sideWaist)
	}

	// --- waist segment (the default dart position) ---
	if dartPosition == "waist" {
		target := point{apexX, height}
		leg1, leg2 := dartLegsAt(apex, target, theta)
		first, second := orderAlong(leg1, leg2, sub(cfBottom, sideWaist))
		pb.lineTo(first).lineTo(apex).lineTo(second).lineTo(cfBottom)
	} else {
		pb.lineTo(cfBottom)
	}

	pb.lineTo(cfTop).close()

	return Piece{
		Name:     "Bodice front",
		PathData: pb.String(),
		Width:    round1(width),
		Height:   round1(height),
		FoldEdge: "left",
		Notes:    "Half front, center front (left edge) on fold. Dart rotated to: " + dartPosition + ". Refine fit with a muslin toile.",
	}
}

func draftBack(qBust, qWaist, scye, neckW, shoulderLen, backWaistLen float64) Piece {
	height := backWaistLen
	neckDrop := neckW * 0.35 // back neck sits much shallower than front
	shoulderDrop := 1.3
	shoulderTipX := neckW + shoulderLen*0.9
	backScye := scye - 1 // back armhole is typically a touch shallower than front

	width := math.Max(qBust, shoulderTipX)

	// A smaller waist dart than the front — the back has less shaping
	// to do since there's no bust curve to absorb.
	dartIntake := clamp(qBust-qWaist-1.5, 0.5, 4) * 0.6
	apexX := clamp(qBust*0.5, 0, qWaist*0.85)
	apex := point{round1(apexX), round1(backScye + (height-backScye)*0.5)}

	cbTop := point{0, round1(neckDrop)}
	neckPoint := point{round1(neckW), 0}
	shoulderTip := point{round1(shoulderTipX), round1(shoulderDrop)}
	underarm := point{round1(qBust), round1(backScye)}
	sideWaist := point{round1(qWaist), round1(height)}
	dartRight := point{round1(apexX + dartIntake/2), round1(height)}
	dartLeft := point{round1(apexX - dartIntake/2), round1(height)}
	cbBottom := point{0, round1(height)}

	pb := &pathBuilder{}
	pb.moveTo(cbTop).
		curveTo(
			point{round1(cbTop.x), round1(neckDrop * 0.3)},
			point{round1(neckW * 0.5), 0},
			neckPoint,
		).
		lineTo(shoulderTip).
		curveTo(
			point{round1(shoulderTip.x + (underarm.x-shoulderTip.x)*0.25 + 1.2), round1(shoulderTip.y + (underarm.y-shoulderTip.y)*0.15)},
			point{round1(underarm.x + 1.0), round1(underarm.y - (underarm.y-shoulderTip.y)*0.3)},
			underarm,
		).
		lineTo(sideWaist).
		lineTo(dartRight).
		lineTo(apex).
		lineTo(dartLeft).
		lineTo(cbBottom).
		lineTo(cbTop).
		close()

	return Piece{
		Name:     "Bodice back",
		PathData: pb.String(),
		Width:    round1(width),
		Height:   round1(height),
		FoldEdge: "left",
		Notes:    "Half back, center back (left edge) on fold. Small waist dart included.",
	}
}
