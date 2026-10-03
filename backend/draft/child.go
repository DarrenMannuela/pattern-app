package draft

// Package-level note on children's blocks: a child's torso doesn't
// have the bust curve an adult dart exists to accommodate, so
// draping an adult dart-based block onto kids' measurements produces
// a shape that's simply wrong, not just ungraded. DraftChildBodice is
// a separate, dartless construction — the front and back are the
// same basic shape, just with a bit of A-line flare at the hem
// instead of a waist taper, which is standard practice for children's
// shirts (comfort and ease of movement matter more than waist
// shaping at this age). Waist is accepted for future pieces (e.g.
// trousers) but isn't used by this block.

// DraftChildBodice returns [front, back] for a child's shirt block.
// Treat m.Bust as chest circumference. Any zero field falls back to
// a plausible average for a mid-range child size (around age 8) via
// childDefaults, not the adult defaults DraftBodice uses.
func DraftChildBodice(m Measurements) []Piece {
	m = childDefaults(m)

	ease := m.Ease
	qChest := m.Bust/4 + ease/4
	scye := shirtScye(m.Bust)
	neckW := m.Neck / 5

	front, frontArmhole, _ := draftRelaxedFront(m.Bust, qChest, scye, neckW, m.Shoulder, m.BackWaistLength, 0, "Child bodice front")
	back, backArmhole, _ := draftRelaxedBack(m.Bust, qChest, scye, neckW, m.Shoulder, m.BackWaistLength, 0, "Child bodice back")
	sleeve := draftSleeve(frontArmhole+backArmhole, m.SleeveLength, m.UpperArm, m.Wrist, m.Ease, 2*(neckW+m.Shoulder), "full", "Child sleeve")
	return []Piece{front, back, sleeve}
}

// childDefaults fills zero fields with plausible measurements for a
// mid-range child size (around age 8), not the adult averages
// Measurements.withDefaults uses. Deliberately more ease than the
// adult default (10cm vs 6cm) — room to move and grow matters more
// than a fitted line for uniform wear.
func childDefaults(m Measurements) Measurements {
	if m.Bust == 0 {
		m.Bust = 60
	}
	if m.Waist == 0 {
		m.Waist = 56
	}
	if m.BackWaistLength == 0 {
		m.BackWaistLength = 28.7
	}
	if m.Shoulder == 0 {
		m.Shoulder = 9.8
	}
	if m.Neck == 0 {
		m.Neck = 29
	}
	if m.Ease == 0 {
		m.Ease = 10
	}
	if m.SleeveLength == 0 {
		m.SleeveLength = 38
	}
	if m.UpperArm == 0 {
		m.UpperArm = 21
	}
	if m.Wrist == 0 {
		m.Wrist = 13
	}
	return m
}

// draftRelaxedFront drafts a dartless front torso — shared by the
// child bodice and the adult PE/relaxed-fit shirt, since both want
// the same comfort-first construction (no bust dart, straight side) just at different scales. name becomes the returned Piece's
// Name so each caller's pieces stay distinguishable.
// qHem is the least the hem may be (a quarter of it); 0 for a block that
// stops at the waist.
func draftRelaxedFront(bust, qChest, scye, neckW, shoulderLen, backWaistLen, qHem float64, name string) (Piece, float64, float64) {
	p, armholeLen, neckLen := relaxedPanel(bust, qChest, scye, neckW, shoulderLen, backWaistLen, max2(qChest, qHem), false)
	p.Name = name
	p.Notes = "Half front, center front (left edge) on fold. Dartless (no bust curve to shape for) with a straight side seam. Waist measurement not used by this block."
	return p, armholeLen, neckLen
}

// draftRelaxedBack is draftRelaxedFront's back-piece counterpart —
// see that function's doc comment.
func draftRelaxedBack(bust, qChest, scye, neckW, shoulderLen, backWaistLen, qHem float64, name string) (Piece, float64, float64) {
	p, armholeLen, neckLen := relaxedPanel(bust, qChest, scye, neckW, shoulderLen, backWaistLen, max2(qChest, qHem), true)
	p.Name = name
	p.Notes = "Half back, center back (left edge) on fold. Dartless, matching straight side seam to the front."
	return p, armholeLen, neckLen
}

// relaxedPanel is the dartless half front or back both relaxed blocks
// share: neckline, shoulder, armhole, a straight side seam down to the hem
// (every reference shirt chart has the hem as wide as the chest) and the
// centre line. The front's neck is deeper and its shoulder drops more.
func relaxedPanel(bust, qChest, scye, neckW, shoulderLen, length, hemWidth float64, back bool) (Piece, float64, float64) {
	neckDrop := frontNeckDepth(neckW)
	seam, slope := shoulderLen-shoulderEase/2, frontShoulderSlope*shoulderSlopeScale(bust)
	if back {
		neckDrop = neckW * 0.3 // shallower than the front, as in the adult block
		seam, slope = shoulderLen+shoulderEase/2, backShoulderSlope*shoulderSlopeScale(bust)
	}
	centreTop := point{0, round1(neckDrop)}
	neckPoint := point{round1(neckW), 0}
	shoulderTip := shoulderTipAt(neckPoint, seam, slope)
	shoulderTipX := shoulderTip.x
	underarm := point{round1(qChest), round1(scye)} // same bust line front and back, so the side seams true
	hemSide := point{round1(hemWidth), round1(length)}
	centreBottom := point{0, round1(length)}

	nc1, nc2 := neckControls(centreTop, neckPoint, shoulderTip)
	armhole := draftArmhole(neckPoint, shoulderTip, underarm, hemSide, back)

	o := outline{start: centreTop}
	o.curveTo(nc1, nc2, neckPoint).lineTo(shoulderTip).add(armhole...)
	o.lineTo(hemSide).lineTo(centreBottom).lineTo(centreTop)

	return Piece{
		PathData:    o.path(),
		Width:       round1(max2(qChest, hemWidth, shoulderTipX)),
		Height:      round1(length),
		FoldEdge:    "left",
		ShoulderTip: &Point{X: shoulderTip.x, Y: shoulderTip.y},
		Landmarks:   panelLandmarks(neckPoint, shoulderTip, underarm, hemSide, centreBottom),
	}, lengthOf(shoulderTip, armhole), cubicLength(centreTop, nc1, nc2, neckPoint)
}

// panelLandmarks names the points a drawing needs to find its way round a
// torso panel's outline: where the neckline, shoulder, armhole, side seam
// and hem each end.
func panelLandmarks(neckPoint, shoulderTip, underarm, hemSide, hemCentre point) map[string]Point {
	pt := func(p point) Point { return Point{X: round1(p.x), Y: round1(p.y)} }
	return map[string]Point{
		"neckPoint":   pt(neckPoint),
		"shoulderTip": pt(shoulderTip),
		"underarm":    pt(underarm),
		"hemSide":     pt(hemSide),
		"hemCentre":   pt(hemCentre),
	}
}

func max2(vals ...float64) float64 {
	m := vals[0]
	for _, v := range vals[1:] {
		if v > m {
			m = v
		}
	}
	return m
}
