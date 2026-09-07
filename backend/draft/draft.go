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

// DraftBodice returns the front and back bodice pieces for the given
// measurements, as a two-element slice: [front, back].
func DraftBodice(m Measurements) []Piece {
	m = m.withDefaults()

	ease := m.Ease
	qBust := m.Bust/4 + ease/4   // quarter-bust, the classic drafting unit
	qWaist := m.Waist/4 + ease/4 // quarter-waist
	scye := m.Bust/4 + 2.5       // "scye depth" — armhole depth below the neck/shoulder line
	neckW := m.Neck / 5

	front := draftFront(qBust, qWaist, scye, neckW, m.Shoulder, m.BackWaistLength)
	back := draftBack(qBust, qWaist, scye, neckW, m.Shoulder, m.BackWaistLength)
	return []Piece{front, back}
}

func draftFront(qBust, qWaist, scye, neckW, shoulderLen, backWaistLen float64) Piece {
	height := backWaistLen + 1.5 // front block runs slightly longer than back, for the bust curve
	neckDrop := neckW + 1.5
	shoulderDrop := 2.0
	shoulderTipX := neckW + shoulderLen*0.94

	// Bounding width is whichever extends further right: the bust
	// point or the shoulder tip.
	width := math.Max(qBust, shoulderTipX)

	// Waist dart: centered roughly under the bust point, sized off
	// the difference between bust and waist (the classic "how much
	// fabric needs to fold away between a bigger bust and a smaller
	// waist" calculation), clamped to a sewable range.
	dartIntake := clamp(qBust-qWaist-1.5, 0.5, 4)
	apexX := clamp(qBust*0.55, 0, qWaist*0.9)
	apex := point{round1(apexX), round1(scye + (height-scye)*0.42)}

	cfTop := point{0, round1(neckDrop)}
	neckPoint := point{round1(neckW), 0}
	shoulderTip := point{round1(shoulderTipX), round1(shoulderDrop)}
	underarm := point{round1(qBust), round1(scye)}
	sideWaist := point{round1(qWaist), round1(height)}
	dartRight := point{round1(apexX + dartIntake/2), round1(height)}
	dartLeft := point{round1(apexX - dartIntake/2), round1(height)}
	cfBottom := point{0, round1(height)}

	pb := &pathBuilder{}
	pb.moveTo(cfTop).
		// neckline: concave curve from center front up to the shoulder/neck point
		curveTo(
			point{round1(cfTop.x), round1(neckDrop * 0.4)},
			point{round1(neckW * 0.55), round1(neckDrop * 0.12)},
			neckPoint,
		).
		lineTo(shoulderTip). // shoulder seam
		// armhole: curves out from the shoulder then sharply back in at the underarm
		curveTo(
			point{round1(shoulderTip.x + (underarm.x-shoulderTip.x)*0.25 + 1.5), round1(shoulderTip.y + (underarm.y-shoulderTip.y)*0.15)},
			point{round1(underarm.x + 1.2), round1(underarm.y - (underarm.y-shoulderTip.y)*0.3)},
			underarm,
		).
		lineTo(sideWaist). // side seam taper from bust to waist
		lineTo(dartRight). // waist edge to the dart
		lineTo(apex).      // up the first dart leg
		lineTo(dartLeft).  // down the second dart leg
		lineTo(cfBottom).  // rest of the waist edge to center front
		lineTo(cfTop).     // straight up the center-front fold line
		close()

	return Piece{
		Name:     "Bodice front",
		PathData: pb.String(),
		Width:    round1(width),
		Height:   round1(height),
		FoldEdge: "left",
		Notes:    "Half front, center front (left edge) on fold. Waist dart included; refine fit with a muslin toile.",
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
