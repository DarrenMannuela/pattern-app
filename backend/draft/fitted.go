package draft

import "math"

// THE FITTED (WOMEN'S) BLOCK, front and back, to the waist (a bodice) or
// on down to the hem (a shirt).
//
// This replaces a block that took a waist-length bodice and stretched it to
// shirt length: its waist shaping ran on to the hem, so a size-M shirt was
// 68cm round the hem on a 98cm hip, and the waist dart was taken out on top
// of a side seam already cut to the waist, so even the bodice came out 10cm
// too small at the waist. A moved bust dart was cut into the new edge as a
// notch, which shortened that seam (the shoulder no longer matched the back).
//
// The construction here is the standard one (Aldrich, Metric Pattern
// Cutting for Women's Wear; the So-en kemeja wanita drafts):
//
//   - The waist is shaped partly at the side seam and partly by a waist dart,
//     and the two add up to the bust-to-waist difference, so the finished
//     waist is the waist measurement plus ease.
//   - On a shirt the waist dart is a fish-eye (double-pointed) dart: widest
//     at the waist, closing about 12cm below it, above the hip. Below the
//     waist the side seam curves out to the hip, so the shirt clears the hip.
//   - The front is longer than the back at centre front, for the bust. With
//     the dart at the waist that extra length is at the front hem; with a
//     side (or French) dart, the dart takes it out of the side seam, so the
//     side seam matches the back and the hem runs level.
//   - A shoulder, armhole or neckline dart is the side dart pivoted: the
//     part of the front between the two positions is turned about the dart
//     point, which closes the side dart and opens the new one. The turned
//     part keeps its shape, so every seam keeps its length.
//   - Every dart's legs are the same length (the tip is on the line halfway
//     between them), so the dart sews closed flat, and the tip stops short
//     of the bust point.

type fittedSpec struct {
	bust                float64 // the body's bust, which grades the shoulder slope
	qBust, qWaist, qHip float64
	scye, neckW         float64
	shoulderLen         float64
	waistLen            float64 // nape to waist
	length              float64 // nape to hem; equal to waistLen for a bodice
	dartPosition        string
	shirttail           bool
}

const (
	bustExtra      = 1.5  // how much longer the front is than the back at centre front
	fishEyeBelow   = 12.0 // how far below the waist a shirt's waist dart closes
	sideDartBelow  = 5.0  // a side bust dart's upper leg, below the underarm
	frenchAbove    = 5.0  // a French dart's upper leg, above the waist
	bustDartShort  = 2.5  // how far short of the bust point a side dart stops
	movedDartShort = 3.5  // ...and a dart moved to the shoulder, armhole or neck
)

func (s fittedSpec) isShirt() bool { return s.length > s.waistLen+3 }

// hipDepth is the waist-to-hip depth: 18cm on an adult's 40cm back, less
// on a shorter body.
func (s fittedSpec) hipDepth() float64 { return clamp(s.waistLen*0.45, 12, 21) }

// shaping splits the bust-to-waist difference between the side seam and
// the waist dart: the dart takes about half on the front, a bit less on the
// back (Aldrich's shirt blocks put 2-3cm in each).
func (s fittedSpec) shaping(back bool) (dart, sideWaistX float64) {
	diff := math.Max(0, s.qBust-s.qWaist)
	share, most := 0.5, 3.0
	if back {
		share, most = 0.4, 2.5
	}
	dart = clamp(diff*share, 0, most)
	return dart, s.qWaist + dart
}

// sideSeam draws the side seam from the underarm down to the hem: in to the
// waist, then (on a shirt) out to the hip and straight on to the hem.
// It returns the segments and the hem's side point.
func (s fittedSpec) sideSeam(sideWaistX float64) ([]seg, point) {
	waist := point{sideWaistX, s.waistLen}
	if !s.isShirt() {
		return []seg{{p: waist}}, waist
	}
	hipY := s.waistLen + s.hipDepth()
	hipX := math.Max(s.qHip, sideWaistX)
	hem := point{hipX, s.length}
	if s.length < hipY { // a short shirt stops before the hip
		t := (s.length - s.waistLen) / (hipY - s.waistLen)
		hem = point{sideWaistX + (hipX-sideWaistX)*t, s.length}
		hipY = s.length
	}
	h := hipY - s.waistLen
	out := []seg{
		{p: waist},
		{curve: true, c1: point{waist.x, waist.y + h*0.4}, c2: point{hem.x, hipY - h*0.35}, p: point{hem.x, hipY}},
	}
	if hem.y > hipY+0.05 {
		out = append(out, seg{p: hem})
	}
	return out, hem
}

// hem runs from the side seam to the centre line: square to the side seam
// at the side and square to the centre line at the centre, so the halves
// and the front and back join without a notch. A shirttail rises at the side.
func (s fittedSpec) hem(side point, centreY float64) (seg, point) {
	if s.shirttail {
		side.y -= hemRise
	}
	return seg{curve: true, c1: point{side.x * 0.75, side.y}, c2: point{side.x * 0.4, centreY}, p: point{0, centreY}}, side
}

// fittedDarts are a piece's dart markings.
type fittedDarts [][]Point

func (d *fittedDarts) add(pts ...point) {
	row := make([]Point, len(pts))
	for i, p := range pts {
		row[i] = Point{X: round1(p.x), Y: round1(p.y)}
	}
	*d = append(*d, row)
}

// waistDart is the waist dart at x, intake wide, from top down: on a shirt
// a fish-eye closed below the waist, on a bodice a wedge open at the waist
// edge (returned as its two legs, for the outline to cut in).
func (s fittedSpec) waistDart(x, top, waistY, intake float64, marks *fittedDarts) (legL, tip, legR point) {
	tip = point{x, top}
	legL, legR = point{x - intake/2, waistY}, point{x + intake/2, waistY}
	if s.isShirt() {
		bottom := point{x, waistY + math.Min(fishEyeBelow, s.hipDepth()-2)}
		marks.add(tip, legL, bottom, legR, tip)
	} else {
		marks.add(legL, tip, legR)
	}
	return
}

// draftFittedFront returns the half front, its armhole and neckline lengths.
func draftFittedFront(s fittedSpec) (Piece, float64, float64) {
	neckDrop := frontNeckDepth(s.neckW)
	centreTop := point{0, round1(neckDrop)}
	neckPoint := point{round1(s.neckW), 0}
	shoulderTip := shoulderTipAt(neckPoint, s.shoulderLen-shoulderEase/2, frontShoulderSlope*shoulderSlopeScale(s.bust))
	underarm := point{round1(s.qBust), round1(s.scye)}
	apex := point{s.qBust * 0.4, s.scye + 3} // bust point: half the bust span in, 3cm under the chest line
	nc1, nc2 := neckControls(centreTop, neckPoint, shoulderTip)
	neck := seg{curve: true, c1: nc1, c2: nc2, p: neckPoint}
	dartW, sideWaistX := s.shaping(false)
	armhole := draftArmhole(neckPoint, shoulderTip, underarm, point{sideWaistX, s.waistLen}, false)
	armholeLen := lengthOf(shoulderTip, armhole)
	neckLen := cubicLength(centreTop, nc1, nc2, neckPoint)

	side, hemSide := s.sideSeam(sideWaistX)
	var marks fittedDarts

	// The drawing's outline: the front with the bust length at centre front
	// and no bust dart — what the finished front looks like.
	drawn := outline{start: centreTop}
	drawn.add(neck).lineTo(shoulderTip).add(armhole...).add(side...)
	hemSeg, hemSideDrawn := s.hem(hemSide, s.length+bustExtra)
	if !s.isShirt() {
		hemSeg = seg{p: point{0, s.length + bustExtra}}
	}
	drawn.segs[len(drawn.segs)-1].p = hemSideDrawn
	drawn.add(hemSeg)

	pos := validDartPosition(s.dartPosition)
	var o outline
	lm := panelLandmarks(neckPoint, shoulderTip, underarm, hemSideDrawn, point{0, s.length + bustExtra})

	if pos == "waist" {
		// No bust dart: the extra length stays at centre front.
		o = outline{start: centreTop}
		o.add(neck).lineTo(shoulderTip).add(armhole...).add(side...)
		waistY := s.waistLen + bustExtra*(1-apex.x/sideWaistX) // the waist line dips toward centre front
		l, tip, r := s.waistDart(apex.x, apex.y+bustDartShort, waistY, dartW, &marks)
		if s.isShirt() {
			o.segs[len(o.segs)-1].p = hemSideDrawn
			o.add(hemSeg)
		} else {
			// The bodice's waist edge, with the dart cut into it.
			o.add(waistFromSide(underarm, point{sideWaistX, s.waistLen}, r)).lineTo(tip).lineTo(l).lineTo(point{0, s.length + bustExtra})
		}
	} else {
		// The landmarks stay the drawing's: they find their way round Outline.
		o = pivotedFront(s, pos, centreTop, neck, shoulderTip, armhole, side, apex, dartW, sideWaistX, &marks)
	}
	o.lineTo(centreTop)

	return Piece{
		Name:        "Bodice front",
		PathData:    o.path(),
		Outline:     drawn.path(),
		Width:       widthOf(o.path()),
		Height:      round1(s.length + bustExtra),
		FoldEdge:    "left",
		Notes:       "Half front, center front (left edge) on fold. Bust dart at the " + pos + "; waist dart as marked. Refine fit with a muslin toile.",
		ShoulderTip: &Point{X: shoulderTip.x, Y: shoulderTip.y},
		Landmarks:   lm,
		Darts:       marks,
	}, armholeLen, neckLen
}

// pivotedFront drafts the front with its bust dart in the side seam (a side
// or French dart), or moved from there to the shoulder, armhole or neckline.
func pivotedFront(s fittedSpec, pos string, centreTop point, neck seg, shoulderTip point, armhole, side []seg, apex point, dartW, sideWaistX float64, marks *fittedDarts) outline {
	underarm := armhole[len(armhole)-1].p
	waist := side[0].p

	// The side dart's upper leg, on the side seam.
	legY := underarm.y + sideDartBelow
	if pos == "french" {
		legY = waist.y - frenchAbove
	}
	t := (legY - underarm.y) / (waist.y - underarm.y)
	upperLeg := lerp(underarm, waist, t)

	// The part of the front below the dart drops by v, which is square to
	// the dart's centre line (so the legs come out equal) and drops it by
	// bustExtra (so the side seam, less the dart, matches the back).
	toApex := unit(sub(apex, upperLeg))
	n := point{-toApex.y, toApex.x}
	if n.y < 0 {
		n = scale(n, -1)
	}
	v := scale(n, bustExtra/n.y)
	lowerLeg := add(upperLeg, v)
	mid := lerp(upperLeg, lowerLeg, 0.5)
	pivot := add(mid, scale(toApex, dot(sub(apex, mid), toApex))) // the dart point, level with the bust point

	// Everything below the dart, dropped. The centre line only drops.
	drop := func(p point) point { return add(p, v) }
	var lower []seg
	lower = append(lower, seg{p: drop(waist)})
	for _, sg := range side[1:] {
		lower = append(lower, seg{curve: sg.curve, c1: drop(sg.c1), c2: drop(sg.c2), p: drop(sg.p)})
	}
	hemSide := lower[len(lower)-1].p
	centreY := s.length + v.y
	var hem seg
	if s.isShirt() {
		hem, hemSide = s.hem(hemSide, centreY)
		lower[len(lower)-1].p = hemSide
	}
	waistY := s.waistLen + v.y
	l, tip, r := s.waistDart(apex.x, apex.y+bustDartShort, waistY, dartW, marks)
	finishLower := func(o *outline) {
		o.add(lower...)
		if s.isShirt() {
			o.add(hem)
		} else {
			o.add(waistFromSide(upperLeg, drop(waist), r)).lineTo(tip).lineTo(l).lineTo(point{0, centreY})
		}
	}
	if pos == "side" || pos == "french" {
		dartTip := add(mid, scale(toApex, math.Max(0, math.Hypot(apex.x-mid.x, apex.y-mid.y)-bustDartShort)))
		o := outline{start: centreTop}
		o.add(neck).lineTo(shoulderTip).add(armhole...).lineTo(upperLeg).lineTo(dartTip).lineTo(lowerLeg)
		finishLower(&o)
		marks.add(upperLeg, dartTip, lowerLeg)
		return o
	}

	// Pivot: turn the part between the new dart and the side dart about the
	// dart point until the side dart closes.
	theta := math.Atan2(sub(lowerLeg, pivot).y, sub(lowerLeg, pivot).x) - math.Atan2(sub(upperLeg, pivot).y, sub(upperLeg, pivot).x)
	turn := func(sg seg) seg { return sg.rotated(pivot, theta) }
	turnPt := func(p point) point { return add(pivot, rotate(sub(p, pivot), theta)) }

	// The fixed part up to the new dart's first leg, and the turned part
	// from its second leg round to the (closed) side dart.
	var fixed, moving []seg
	var at point
	switch pos {
	case "neckline":
		a, b := splitSeg(centreTop, neck, 0.5)
		at = a.p
		fixed = []seg{a}
		moving = append([]seg{b, {p: shoulderTip}}, armhole...)
	case "armhole":
		// Where the armhole starts to turn under the arm, as armhole darts
		// sit: higher up it runs almost parallel to the dart.
		a, b := splitSeg(armhole[0].p, armhole[1], 0.3)
		at = a.p
		fixed = []seg{neck, {p: shoulderTip}, armhole[0], a}
		moving = []seg{b}
	default: // shoulder, 40% of the way out from the neck — where shoulder darts sit
		at = lerp(neck.p, shoulderTip, 0.4)
		fixed = []seg{neck, {p: at}}
		moving = append([]seg{{p: shoulderTip}}, armhole...)
	}
	moving = append(moving, seg{p: upperLeg})

	o := outline{start: centreTop}
	o.add(fixed...)
	at2 := turnPt(at)
	dartMid := lerp(at, at2, 0.5)
	toPivot := unit(sub(pivot, dartMid))
	dartTip := add(dartMid, scale(toPivot, math.Max(0, math.Hypot(pivot.x-dartMid.x, pivot.y-dartMid.y)-movedDartShort)))
	o.lineTo(dartTip).lineTo(at2)
	for _, sg := range moving {
		o.add(turn(sg))
	}
	// The turned side dart's upper leg now sits on the lower leg.
	o.segs[len(o.segs)-1].p = lowerLeg
	finishLower(&o)
	marks.add(at, dartTip, at2)
	return o
}

// draftFittedBack returns the half back (split at the yoke seam when yoke is
// set), its armhole and neckline lengths.
func draftFittedBack(s fittedSpec, yoke bool) (yokePiece, back Piece, armholeLen, neckLen float64) {
	centreTop := point{0, round1(s.neckW * 0.35)}
	neckPoint := point{round1(s.neckW), 0}
	shoulderTip := shoulderTipAt(neckPoint, s.shoulderLen+shoulderEase/2, backShoulderSlope*shoulderSlopeScale(s.bust))
	underarm := point{round1(s.qBust), round1(s.scye)}
	nc1, nc2 := neckControls(centreTop, neckPoint, shoulderTip)
	dartW, sideWaistX := s.shaping(true)
	armhole := draftArmhole(neckPoint, shoulderTip, underarm, point{sideWaistX, s.waistLen}, true)
	armholeLen = lengthOf(shoulderTip, armhole)
	neckLen = cubicLength(centreTop, nc1, nc2, neckPoint)

	side, hemSide := s.sideSeam(sideWaistX)
	var marks fittedDarts
	dartX := s.qBust * 0.4
	top := s.waistLen - (s.waistLen-s.scye)*0.65 // the back dart reaches two-thirds of the way up to the chest line
	l, tip, r := s.waistDart(dartX, top, s.waistLen, dartW, &marks)

	o := outline{start: centreTop}
	o.curveTo(nc1, nc2, neckPoint).lineTo(shoulderTip).add(armhole...).add(side...)
	drawn := outline{start: centreTop}
	drawn.curveTo(nc1, nc2, neckPoint).lineTo(shoulderTip).add(armhole...).add(side...)
	if s.isShirt() {
		hemSeg, hs := s.hem(hemSide, s.length)
		hemSide = hs
		o.segs[len(o.segs)-1].p, drawn.segs[len(drawn.segs)-1].p = hs, hs
		o.add(hemSeg)
		drawn.add(hemSeg)
	} else {
		o.add(waistFromSide(underarm, point{sideWaistX, s.waistLen}, r)).lineTo(tip).lineTo(l).lineTo(point{0, s.length})
		drawn.lineTo(point{0, s.length})
	}
	o.lineTo(centreTop)

	back = Piece{
		Name:        "Bodice back",
		PathData:    o.path(),
		Outline:     drawn.path(),
		Width:       widthOf(o.path()),
		Height:      round1(s.length),
		FoldEdge:    "left",
		Notes:       "Half back, center back (left edge) on fold. Waist dart as marked.",
		ShoulderTip: &Point{X: shoulderTip.x, Y: shoulderTip.y},
		Landmarks:   panelLandmarks(neckPoint, shoulderTip, underarm, hemSide, point{0, s.length}),
		Darts:       marks,
	}
	if yoke {
		yokePiece, back = splitYoke(back, s.scye)
		back.Outline = ""
		back.Notes = "Half back panel, center back (left edge) on fold. Waist dart as marked. Joins the yoke above along a felled seam."
		back.Darts = marks
	}
	return yokePiece, back, armholeLen, neckLen
}

// widthOf is how far right a path reaches.
func widthOf(d string) float64 {
	w := 0.0
	for _, p := range flattenPath(d) {
		w = math.Max(w, p.x)
	}
	return round1(w)
}

// waistFromSide is a bodice's waist edge from the side seam in to the first
// dart leg: it leaves the side seam square, so front and back join at the
// side without a point, and runs in level to the dart.
func waistFromSide(sideFrom, sideWaist, to point) seg {
	side := unit(sub(sideWaist, sideFrom))
	in := point{-side.y, side.x}
	if in.x > 0 {
		in = scale(in, -1)
	}
	d := math.Abs(sideWaist.x-to.x) * 0.35
	return seg{curve: true, c1: add(sideWaist, scale(in, d)), c2: point{to.x + d, to.y}, p: to}
}
