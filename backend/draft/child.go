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
	scye := m.Bust/4 + 2.0 // shallower than the adult's +2.5 — kids' armholes are proportionally smaller
	neckW := m.Neck / 5

	front, frontArmhole, _ := draftRelaxedFront(qChest, scye, neckW, m.Shoulder, m.BackWaistLength, "Child bodice front")
	back, backArmhole, _ := draftRelaxedBack(qChest, scye, neckW, m.Shoulder, m.BackWaistLength, "Child bodice back")
	sleeve := draftSleeve(frontArmhole+backArmhole, m.SleeveLength, m.UpperArm, m.Wrist, m.Ease, "Child sleeve")
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
// the same comfort-first construction (no bust dart, gentle A-line
// hem) just at different scales. name becomes the returned Piece's
// Name so each caller's pieces stay distinguishable.
func draftRelaxedFront(qChest, scye, neckW, shoulderLen, backWaistLen float64, name string) (Piece, float64, float64) {
	height := backWaistLen // no bust-curve allowance needed — the front and back run the same length
	neckDrop := neckW + 1.0
	shoulderDrop := 1.5 // less slope than the adult's 2.0 — a child's shoulder line sits squarer
	shoulderTipX := neckW + shoulderLen*0.94
	hemWidth := qChest + 1.5 // gentle A-line flare instead of a waist taper

	width := max2(qChest, hemWidth, shoulderTipX)

	cfTop := point{0, round1(neckDrop)}
	neckPoint := point{round1(neckW), 0}
	shoulderTip := point{round1(shoulderTipX), round1(shoulderDrop)}
	underarm := point{round1(qChest), round1(scye)}
	hemSide := point{round1(hemWidth), round1(height)}
	cfBottom := point{0, round1(height)}

	nc1 := point{round1(cfTop.x), round1(neckDrop * 0.4)}
	nc2 := point{round1(neckW * 0.55), round1(neckDrop * 0.12)}
	ac1 := point{round1(shoulderTip.x + (underarm.x-shoulderTip.x)*0.25 + 1.0), round1(shoulderTip.y + (underarm.y-shoulderTip.y)*0.15)}
	ac2 := point{round1(underarm.x + 1.0), round1(underarm.y - (underarm.y-shoulderTip.y)*0.3)}

	pb := &pathBuilder{}
	pb.moveTo(cfTop).
		curveTo(nc1, nc2, neckPoint).
		lineTo(shoulderTip).
		curveTo(ac1, ac2, underarm).
		lineTo(hemSide). // straight taper from underarm to a slightly flared hem, no dart
		lineTo(cfBottom).
		lineTo(cfTop).
		close()

	armholeLen := cubicLength(shoulderTip, ac1, ac2, underarm)
	neckLen := cubicLength(cfTop, nc1, nc2, neckPoint)

	return Piece{
		Name:        name,
		PathData:    pb.String(),
		Width:       round1(width),
		Height:      round1(height),
		FoldEdge:    "left",
		Notes:       "Half front, center front (left edge) on fold. Dartless (no bust curve to shape for) with a gentle A-line hem flare. Waist measurement not used by this block.",
		ShoulderTip: &Point{X: shoulderTip.x, Y: shoulderTip.y},
	}, armholeLen, neckLen
}

// draftRelaxedBack is draftRelaxedFront's back-piece counterpart —
// see that function's doc comment.
func draftRelaxedBack(qChest, scye, neckW, shoulderLen, backWaistLen float64, name string) (Piece, float64, float64) {
	height := backWaistLen
	neckDrop := neckW * 0.3 // shallower still than the front, same relationship as the adult block
	shoulderDrop := 1.0
	shoulderTipX := neckW + shoulderLen*0.9
	backScye := scye - 0.8
	hemWidth := qChest + 1.5

	width := max2(qChest, hemWidth, shoulderTipX)

	cbTop := point{0, round1(neckDrop)}
	neckPoint := point{round1(neckW), 0}
	shoulderTip := point{round1(shoulderTipX), round1(shoulderDrop)}
	underarm := point{round1(qChest), round1(backScye)}
	hemSide := point{round1(hemWidth), round1(height)}
	cbBottom := point{0, round1(height)}

	nc1 := point{round1(cbTop.x), round1(neckDrop * 0.3)}
	nc2 := point{round1(neckW * 0.5), 0}
	ac1 := point{round1(shoulderTip.x + (underarm.x-shoulderTip.x)*0.25 + 0.8), round1(shoulderTip.y + (underarm.y-shoulderTip.y)*0.15)}
	ac2 := point{round1(underarm.x + 0.8), round1(underarm.y - (underarm.y-shoulderTip.y)*0.3)}

	pb := &pathBuilder{}
	pb.moveTo(cbTop).
		curveTo(nc1, nc2, neckPoint).
		lineTo(shoulderTip).
		curveTo(ac1, ac2, underarm).
		lineTo(hemSide).
		lineTo(cbBottom).
		lineTo(cbTop).
		close()

	armholeLen := cubicLength(shoulderTip, ac1, ac2, underarm)
	neckLen := cubicLength(cbTop, nc1, nc2, neckPoint)

	return Piece{
		Name:        name,
		PathData:    pb.String(),
		Width:       round1(width),
		Height:      round1(height),
		FoldEdge:    "left",
		Notes:       "Half back, center back (left edge) on fold. Dartless, matching A-line hem flare to the front.",
		ShoulderTip: &Point{X: shoulderTip.x, Y: shoulderTip.y},
	}, armholeLen, neckLen
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
