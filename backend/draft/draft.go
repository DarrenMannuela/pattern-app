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
	// ShirtLength is nape to hem for shirts. Zero means "derive it from
	// BackWaistLength" (shirtLengthFromBack).
	ShirtLength  float64 `json:"shirtLength"`
	Shoulder     float64 `json:"shoulder"`     // shoulder seam length
	Neck         float64 `json:"neck"`         // neck circumference
	Ease         float64 `json:"ease"`         // total wearing ease added to bust/waist
	SleeveLength float64 `json:"sleeveLength"` // shoulder point to wrist
	UpperArm     float64 `json:"upperArm"`     // bicep circumference
	Wrist        float64 `json:"wrist"`        // wrist circumference
	Hip          float64 `json:"hip"`          // hip circumference — pants/skirt
	Rise         float64 `json:"rise"`         // crotch depth, waist to crotch level — pants/shorts
	Inseam       float64 `json:"inseam"`       // crotch to hem — pants/shorts (shorter for shorts)
	HemWidth     float64 `json:"hemWidth"`     // leg opening circumference/2 — pants/shorts; 0 derives it from hip
	SkirtLength  float64 `json:"skirtLength"`  // waist to hem — skirt only
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
	if m.SleeveLength == 0 {
		m.SleeveLength = 58
	}
	if m.UpperArm == 0 {
		m.UpperArm = 28
	}
	if m.Wrist == 0 {
		m.Wrist = 17
	}
	if m.Hip == 0 {
		m.Hip = 98
	}
	if m.Rise == 0 {
		m.Rise = 26
	}
	if m.Inseam == 0 {
		m.Inseam = 75
	}
	if m.SkirtLength == 0 {
		m.SkirtLength = 55
	}
	return m
}

// Point is an exported (x, y) location in a Piece's own local
// coordinates — used to expose specific landmarks (like where a
// sleeve's crown should meet a bodice's shoulder) so a caller can
// assemble pieces into a garment preview without having to guess at
// proportions.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Piece is a single drafted pattern piece: a real curved outline
// (as an SVG path) rather than a bounding box.
type Piece struct {
	Name     string  `json:"name"`
	PathData string  `json:"pathData"` // SVG path 'd' attribute, local coords, origin top-left
	Width    float64 `json:"width"`    // bounding box, for nesting/yardage estimates
	Height   float64 `json:"height"`
	FoldEdge string  `json:"foldEdge"` // "left" if that edge is placed on the fabric fold
	// Fabric is "" (the garment's main fabric) or "contrast" — a motif band,
	// an insert panel, a V-neck/collar trim, or a side stripe, cut from a
	// second fabric. The cutting layout nests and counts yardage per fabric,
	// so this has to be set correctly, not left to the Notes text alone.
	Fabric      string `json:"fabric,omitempty"`
	Notes       string `json:"notes"`
	ShoulderTip *Point `json:"shoulderTip,omitempty"` // front/back only: where a sleeve crown attaches
	Crown       *Point `json:"crown,omitempty"`       // sleeve only: the point that attaches to a shoulder tip
	Anchor      *Point `json:"anchor,omitempty"`      // add-on pieces (pocket): where this attaches on its parent piece
	Segment     string `json:"segment,omitempty"`     // add-on pieces: which named garment segment this belongs to (see draft.SegmentXxx)
	// Landmarks exposes named construction points (e.g. a trouser
	// panel's "waistSide"/"hipBulge"/"crotchPt"/"hemInseam"/"hemSide")
	// so a frontend illustration can build its own simplified shape
	// from the SAME real coordinates the pattern was actually drafted
	// with, instead of re-guessing proportions independently. Piece-
	// type-specific, so not every piece populates every key.
	Landmarks map[string]Point `json:"landmarks,omitempty"`
	// Finished-pattern fields, filled by Finish: PathData above is the
	// SEWING line (the block); the cutting line is that outline pushed
	// out by the seam and hem allowances, translated so its own top-left
	// is (0,0). CutOffset is where the sewing line's origin sits inside
	// that cut outline, so a renderer can draw both together.
	CutPathData string      `json:"cutPathData,omitempty"`
	CutWidth    float64     `json:"cutWidth,omitempty"`
	CutHeight   float64     `json:"cutHeight,omitempty"`
	CutOffset   *Point      `json:"cutOffset,omitempty"`
	Grainline   *[4]float64 `json:"grainline,omitempty"` // x1,y1,x2,y2 in sewing-line coordinates
	// Motif is the pattern a contrast piece is cut in ("batik", "stripes", ...;
	// "" or "solid" for a plain contrast fabric). Different motifs are
	// different cloth, bought and laid out separately.
	Motif string `json:"motif,omitempty"`
	// Outline, when set, is the whole panel's sewing line before it was cut
	// into parts (a colour block splits the front). Drawings use it; cutting
	// uses PathData.
	Outline string `json:"outline,omitempty"`
	// Qty is how many copies of this piece as drawn one garment needs.
	// A half piece on a fold counts both halves. Set by FinishAll.
	Qty int `json:"qty,omitempty"`
	// Darts are the darts to mark on the piece, in sewing-line coordinates:
	// a dart cut into an edge as [leg, tip, leg], a fish-eye dart inside the
	// piece as a closed loop [top, side, bottom, side, top].
	Darts [][]Point `json:"darts,omitempty"`
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
	qWaist := m.Waist/4 + ease/8 // quarter-waist: half the chest's ease, as in the Bunka block (W/2 + 3 against B/2 + 6)
	scye := shirtScye(m.Bust)    // armhole depth below the neck/shoulder line — see shirtScye's own chart citation
	neckW := m.Neck / 5

	spec := fittedSpec{bust: m.Bust, qBust: qBust, qWaist: qWaist, qHip: m.Hip/4 + ease/4, scye: scye, neckW: neckW, shoulderLen: m.Shoulder,
		waistLen: m.BackWaistLength, length: m.BackWaistLength, dartPosition: dartPosition}
	front, frontArmhole, _ := draftFittedFront(spec)
	_, back, backArmhole, _ := draftFittedBack(spec, false)
	sleeve := draftSleeve(frontArmhole+backArmhole, m.SleeveLength, m.UpperArm, m.Wrist, ease, 0, "full", "Sleeve")
	return []Piece{front, back, sleeve}
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

// tForY finds the parameter t where a cubic bezier's y-coordinate
// equals targetY, via binary search — used to split a curve (like an
// armhole) at a specific height rather than by t directly, e.g. where
// a back yoke seam crosses the armhole curve. Assumes y is monotonic
// along the curve from p0 to p3, which holds for every armhole curve
// this package drafts (shoulder to underarm, y only increasing).
func tForY(p0, c1, c2, p3 point, targetY float64) float64 {
	lo, hi := 0.0, 1.0
	for i := 0; i < 30; i++ {
		mid := (lo + hi) / 2
		_, _, f, _, _ := splitCubic(p0, c1, c2, p3, mid)
		if f.y < targetY {
			lo = mid
		} else {
			hi = mid
		}
	}
	return (lo + hi) / 2
}

// cubicLength approximates the arc length of a cubic bezier by
// sampling points along it and summing the straight-line segments
// between them — accurate enough to size a sleeve cap to an armhole,
// given every other measurement in this package is already a
// rule-of-thumb approximation.
func cubicLength(p0, c1, c2, p3 point) float64 {
	const steps = 24
	prev := p0
	total := 0.0
	for i := 1; i <= steps; i++ {
		t := float64(i) / steps
		mt := 1 - t
		cur := point{
			x: mt*mt*mt*p0.x + 3*mt*mt*t*c1.x + 3*mt*t*t*c2.x + t*t*t*p3.x,
			y: mt*mt*mt*p0.y + 3*mt*mt*t*c1.y + 3*mt*t*t*c2.y + t*t*t*p3.y,
		}
		total += math.Hypot(cur.x-prev.x, cur.y-prev.y)
		prev = cur
	}
	return total
}

// Shoulder slope, kept as a drop over 15cm of shoulder so a child's shorter
// shoulder drops less than an adult's. Men's shirt drafts slope 5.5 over 15
// at the front and 4.5 at the back (a Chinese men's shirt draft states
// exactly these; Bunka blocks slope 22 and 18 degrees, about 6 and 5 over 15;
// the jarumjahit kemeja drops the front 1/10 of the shoulder width, about
// 4.6). The 4 and 2 used before were credited to So-en, but no source for
// them could be found again, and a back that flat (8 degrees) is far
// flatter than any shirt draft.
const (
	frontShoulderSlope = 5.5 / 15
	backShoulderSlope  = 4.5 / 15
)

// shoulderSlopeScale grades the slope with the body: a child's shoulders
// are much flatter than an adult's. The shop's boys' size-8 shirt chart
// (66cm chest) drops the front shoulder 1.25cm over 8cm — 15:2.3, 0.43 of
// the adult 15:5.5 — and the slope rises to the full men's shirt slope at an
// 88cm chest, linearly between.
func shoulderSlopeScale(bust float64) float64 {
	return clamp(0.43+(bust-66)/(88-66)*0.57, 0.43, 1)
}

// The back shoulder seam is 1cm longer than the front's and eased onto it
// over the shoulder blade (Bunka men's shirt block: front shoulder = back
// shoulder - 1). shoulderLen, the size chart's shoulder, is their middle.
const shoulderEase = 1.0

// shoulderTipAt is the shoulder point: seam cm from the neck point along a
// shoulder that drops slope per cm.
func shoulderTipAt(neckPoint point, seam, slope float64) point {
	a := math.Atan(slope)
	return point{round1(neckPoint.x + seam*math.Cos(a)), round1(neckPoint.y + seam*math.Sin(a))}
}

// frontNeckDepth is how far the front neck drops below the neck point:
// 1/6 of the neck plus 1.5cm. neckW is the neck width, 1/5 of the neck.
func frontNeckDepth(neckW float64) float64 { return neckW*5/6 + 1.5 }

// neckControls are the bezier controls for a neckline from the centre line
// (centre front or back) up to the side neck point: a quarter ellipse that
// leaves the centre line square (so the two mirrored halves join in one smooth
// curve, not a notch) and reaches the neck point square to the shoulder seam,
// as every block-drafting method prescribes, so front and back necklines run
// on smoothly across the shoulder seam and the collar sits flat. The shoulder
// slopes, so "square to it" leans the last part of the curve back toward the
// centre by the shoulder's slope. 0.552 is the usual constant that makes a
// cubic bezier match a quarter circle.
func neckControls(centre, neck, shoulderTip point) (point, point) {
	const k = 0.552
	u := unit(sub(shoulderTip, neck))
	down := point{-u.y, u.x} // square to the shoulder, pointing down
	if down.y < 0 {
		down = scale(down, -1)
	}
	reach := (centre.y - neck.y) * k / math.Max(down.y, 0.5)
	return point{round1(centre.x + (neck.x-centre.x)*k), centre.y},
		point{round1(neck.x + down.x*reach), round1(neck.y + down.y*reach)}
}

// draftSleeve returns a basic one-piece set-in sleeve sized to fit
// the given armhole (the combined front+back armhole curve length),
// using the classic proportional rule cap height = armhole/3. Unlike
// the bodice halves, this is the full piece — cut once on the
// straight grain, not on a fold — so it isn't left-right symmetric:
// the back cap (toward x=0) is drafted flatter than the front cap
// (toward the right), matching how a real armhole is straighter
// across the back and scoops in more sharply under the front.
// sleeveLengthFraction scales the measured (full/wrist-length) sleeve
// down for a shorter cut — there's no separate "half sleeve length"
// measurement in the size chart, so a short or 3/4 sleeve is
// approximated as a fraction of the full one, the same way a real
// pattern maker eyeballs a short-sleeve length off a long-sleeve
// block when no separate spec is given.
func sleeveLengthFraction(style string) float64 {
	switch style {
	case "half":
		return 0.35
	case "three_quarter":
		return 0.68
	default: // "full" or unset
		return 1.0
	}
}

// cuffPleat is the extra sleeve-opening width gathered into a cuff.
const cuffPleat = 4.0

// across is the shoulder width (both shoulders and the neck), or 0 to size the
// sleeve from the arm alone.
func draftSleeve(armhole, sleeveLen, upperArm, wrist, ease, across float64, style, name string) Piece {
	sleeveEase := ease / 3 // a share of the garment's overall wearing ease, for arm movement
	// A shirt sleeve is cut with real room round the arm — the charts run
	// 5-8cm over the arm on an adult (42 wide at the bicep for a chest of
	// 104) — so the bicep ease is at least 15% of the arm, never less than
	// the share of wearing ease. The boys' size-8 chart (26.5 wide on a
	// 24cm arm) still comes out within its tolerance.
	bicepEase := math.Max(sleeveEase, upperArm*0.15)
	halfBicep := (upperArm + bicepEase) / 2
	// A uniform shirt's sleeve is cut roomier, sized from the shoulder the
	// way konveksi kemeja drafts do: half the sleeve is half the shoulder
	// width less 1cm (jarumjahit "Pola Dasar Kemeja Pria": "B–C = ½ lebar
	// bahu – 1cm"). That makes a wide shirt sleeve with a low cap, as real
	// shirts have (a Japanese regular shirt: 46cm wide, 7cm cap). It was
	// cut 2cm narrower for a while only because the preview drew it big.
	if across > 0 {
		halfBicep = math.Max(halfBicep, across/2-1)
	}
	// A sleeve can't be wider than its armhole can take: the cap is at least
	// as long as the sleeve is wide, so on a broad shoulder with a small
	// armhole the shoulder rule asks for a sleeve no cap height can set in.
	// Keep it narrow enough for a shallow shirt cap (15% of the armhole, as
	// low as Japanese shirt caps go), but never narrower than the arm needs.
	armMin := (upperArm + bicepEase) / 2
	for halfBicep > armMin && sleeveCapLength(halfBicep, armhole*minShirtCap, 0, 0) > armhole+sleeveCapEase {
		halfBicep -= 0.25
	}
	halfWristFull := (wrist + sleeveEase*0.5) / 2
	if style != "half" {
		// A cuffed sleeve opens as wide as the cuff (cuffLength, see
		// draftCuff) plus the pleats gathered into it, so the sleeve
		// hangs nearly straight and narrows only a little. Cutting it
		// to the bare wrist made the opening narrower than its own
		// cuff.
		halfWristFull = math.Min(halfBicep*0.9, (cuffLength(wrist)+cuffPleat)/2)
	}
	width := halfBicep * 2

	// A shorter sleeve ends higher up the arm, before it's narrowed
	// toward the wrist, so its hem should sit closer to the bicep
	// width than the full sleeve's wrist width — interpolate the hem
	// by the same fraction used to shorten the length.
	fraction := sleeveLengthFraction(style)
	halfWrist := halfBicep - (halfBicep-halfWristFull)*fraction

	// The cap is drafted the way the charts draw it: a fairly low dome
	// (cap height about a quarter of the armhole — 8cm on the boys' 8
	// chart, 21.5 on the 5XL polo) whose S-shaped edge is then made
	// exactly as long as the armhole plus ease by adjusting the curve's
	// fullness, not by making the dome taller. Truing seams this way is
	// the step every drafting reference lists before cutting.
	// The cap meets the underarm seam square, as the armhole meets the side
	// seam, so the seam under the arm is smooth once the sleeve is set in —
	// the seam's slant depends on the cap height, so solve twice.
	//
	// The hem, too, meets the underarm seams square: a sleeve that narrows is
	// part of a cone, and a cone's hem, laid flat, is an arc — cut straight
	// across, the hem dips to a point at the seam once it is sewn into a
	// tube. The arc keeps the sleeve's length at the centre and drops at the
	// seams by rise.
	length := sleeveLen * fraction
	tilt, rise := 0.0, 0.0
	var capHeight, fullness float64
	for i := 0; i < 3; i++ {
		capHeight, fullness = solveSleeveCap(halfBicep, armhole, tilt)
		// Guard against a length shorter than the cap itself, which would
		// fold the wrist points back above the underarm and self-intersect.
		length = math.Max(sleeveLen*fraction, capHeight+2)
		tilt = math.Atan2(halfBicep-halfWrist, length+rise-capHeight)
		rise = halfWrist * math.Tan(tilt) / 2
	}

	crown := point{round1(halfBicep), 0}
	backUnderarm := point{0, round1(capHeight)}
	frontUnderarm := point{round1(width), round1(capHeight)}
	backWrist := point{round1(halfBicep - halfWrist), round1(length + rise)}
	frontWrist := point{round1(halfBicep + halfWrist), round1(length + rise)}
	reach := halfWrist * 2 / 3
	hemC1 := point{round1(backWrist.x + reach), round1(backWrist.y - reach*math.Tan(tilt))}
	hemC2 := point{round1(frontWrist.x - reach), round1(frontWrist.y - reach*math.Tan(tilt))}

	backC1, backC2, frontC1, frontC2 := sleeveCapControls(halfBicep, capHeight, fullness, tilt)

	pb := &pathBuilder{}
	pb.moveTo(crown).
		curveTo(backC1, backC2, backUnderarm).
		lineTo(backWrist).
		curveTo(hemC1, hemC2, frontWrist).
		lineTo(frontUnderarm).
		curveTo(frontC1, frontC2, crown).
		close()

	return Piece{
		Name:     name,
		PathData: pb.String(),
		Width:    round1(width),
		Height:   round1(length + rise),
		Landmarks: map[string]Point{
			"backUnderarm":  {X: backUnderarm.x, Y: backUnderarm.y},
			"frontUnderarm": {X: frontUnderarm.x, Y: frontUnderarm.y},
			"backWrist":     {X: backWrist.x, Y: backWrist.y},
			"frontWrist":    {X: frontWrist.x, Y: frontWrist.y},
		},
		Notes: "Full piece, cut once per arm (not on fold). Crown at top center; the flatter edge (left) is the back, the more scooped edge (right) is the front — match those to the bodice's back/front armhole when sewing in. Cap curve is drafted to the armhole length plus 2cm of ease. Basic straight sleeve, no elbow shaping.",
		Crown: &Point{X: crown.x, Y: crown.y},
	}
}

// minShirtCap is the lowest a shirt's sleeve cap goes, as a share of the
// armhole (a Japanese regular shirt: a 7cm cap on an armhole of about 46).
const minShirtCap = 0.15

// sleeveCapEase is how much longer the cap curve is than the armhole
// it's sewn into, cm — eased in over the top of the shoulder.
const sleeveCapEase = 2.0

// sleeveCapRatio is the cap height as a fraction of the armhole length,
// read off the charts (0.24 boys' shirt, 0.27 polo).
const sleeveCapRatio = 0.25

// sleeveCapControls are the bezier control points of the sleeve cap:
// back (flatter) then front (more scooped). fullness 0 is a plain
// dome; toward 1 the curve pulls out into an S, which lengthens it
// without raising the crown.
//
// tilt is how far the underarm seams lean in from vertical: the cap's ends
// are turned by it so they meet the seams square.
func sleeveCapControls(halfBicep, capHeight, fullness, tilt float64) (backC1, backC2, frontC1, frontC2 point) {
	f := fullness
	width := halfBicep * 2
	crown := point{halfBicep, 0}
	backUnderarm := point{0, capHeight}
	frontUnderarm := point{width, capHeight}
	backC1 = point{round1(crown.x - halfBicep*(0.28+0.85*f)), round1(capHeight * 0.22 * (1 - f))}
	backC2 = point{round1(backUnderarm.x + halfBicep*(0.15+0.65*f)), round1(capHeight * (0.70 + 0.30*f))}
	frontC1 = point{round1(frontUnderarm.x - halfBicep*(0.22+0.60*f)), round1(capHeight * (0.62 + 0.38*f))}
	frontC2 = point{round1(crown.x + halfBicep*(0.32+0.80*f)), round1(capHeight * 0.16 * (1 - f))}
	square := func(end, c point, sign float64) point {
		v := sub(c, end)
		l := math.Hypot(v.x, v.y)
		return point{round1(end.x + sign*l*math.Cos(tilt)), round1(end.y - l*math.Sin(tilt))}
	}
	backC2 = square(backUnderarm, backC2, 1)
	frontC1 = square(frontUnderarm, frontC1, -1)
	return
}

// sleeveCapLength is the total length of both cap curves.
func sleeveCapLength(halfBicep, capHeight, fullness, tilt float64) float64 {
	crown := point{halfBicep, 0}
	backUnderarm := point{0, capHeight}
	frontUnderarm := point{halfBicep * 2, capHeight}
	b1, b2, f1, f2 := sleeveCapControls(halfBicep, capHeight, fullness, tilt)
	return cubicLength(crown, b1, b2, backUnderarm) + cubicLength(frontUnderarm, f1, f2, crown)
}

// solveSleeveCap returns the cap height and curve fullness that make
// the cap run armhole + sleeveCapEase. It starts at the charts' cap
// height and, only if even the fullest curve can't reach the length
// (a deep armhole on a narrow sleeve), raises the dome until it can.
func solveSleeveCap(halfBicep, armhole, tilt float64) (capHeight, fullness float64) {
	target := armhole + sleeveCapEase
	capHeight = armhole * sleeveCapRatio
	for capHeight < armhole && sleeveCapLength(halfBicep, capHeight, 1, tilt) < target {
		capHeight += 0.25
	}
	// ...and lowers it when even the plainest dome is already longer than
	// the armhole (a wide sleeve on a small armhole), instead of leaving the
	// extra length to be eased in.
	for capHeight > armhole*0.12 && sleeveCapLength(halfBicep, capHeight, 0, tilt) > target {
		capHeight -= 0.25
	}
	if sleeveCapLength(halfBicep, capHeight, 0, tilt) >= target {
		return capHeight, 0
	}
	lo, hi := 0.0, 1.0
	for i := 0; i < 40; i++ {
		mid := (lo + hi) / 2
		if sleeveCapLength(halfBicep, capHeight, mid, tilt) < target {
			lo = mid
		} else {
			hi = mid
		}
	}
	return capHeight, (lo + hi) / 2
}

// shirtLengthFactor turns the nape-to-waist back length into a shirt
// length (nape to hem): a shirt hangs to the hip, about 1.75x the
// waist length — 28.7 -> 50 on the boys' size-8 chart, 40 -> 70 adult.
const shirtLengthFactor = 1.75

// shirtLen is the nape-to-hem length a shirt is drafted to.
func (m Measurements) shirtLen() float64 {
	if m.ShirtLength > 0 {
		return m.ShirtLength
	}
	return m.BackWaistLength * shirtLengthFactor
}
