// Bottoms drafting: a basic trouser block (shared by pants and
// shorts — shorts are just a trouser draft with a short Inseam) and a
// basic dartless A-line skirt block, plus the waistband both share.
//
// Like the rest of this package, these are proportional rule-of-thumb
// blocks for a rough sloper, not couture-precise drafts — real
// trouser/skirt drafting balances front and back crotch curves and
// side-seam lengths far more carefully. Refine with a muslin fitting
// before cutting production fabric.
package draft

// draftTrouserPanel drafts one leg panel — front or back, selected by
// crotchExtFactor (how far the crotch curve bulges out from center:
// small for front, bigger for back, since the seat needs more room)
// and hipBulgeFactor (how far the side seam bulges out at hip level).
// It's a full piece (not on fold) since a trouser leg genuinely has
// two seams (center front/back and inseam), cut twice and mirrored
// for the left/right leg — unlike the bodice, there's no fold edge.
func draftTrouserPanel(m Measurements, crotchExtFactor, hipBulgeFactor float64, name string) Piece {
	ease := m.Ease
	qWaist := m.Waist/4 + ease/4
	qHip := m.Hip/4 + ease/4
	hipDepth := clamp(m.Rise*0.45, 5, m.Rise-2)
	crotchExt := qHip * crotchExtFactor
	hemWidth := m.HemWidth
	if hemWidth == 0 {
		hemWidth = qHip * 0.45
	}
	legLen := m.Rise + m.Inseam

	waistCF := point{0, 0}
	crotchPt := point{round1(crotchExt), round1(m.Rise)}
	hemInseam := point{round1(crotchExt * 0.6), round1(legLen)}
	hemSide := point{round1(hemInseam.x + hemWidth), round1(legLen)}
	waistSide := point{round1(qWaist), 0}
	hipBulge := point{round1(qHip*hipBulgeFactor + crotchExt), round1(hipDepth)}

	// Crotch curve control points (waistCF -> crotchPt).
	cc1 := point{0, round1(m.Rise * 0.5)}
	cc2 := point{round1(crotchExt * 0.7), round1(m.Rise * 0.85)}
	// Side-seam curve control points (hemSide -> waistSide), pulled
	// toward the hip bulge so the seam swells out at the hip and
	// tapers back in above and below it.
	sc1 := lerp(hemSide, hipBulge, 0.5)
	sc2 := lerp(waistSide, hipBulge, 0.5)

	pb := &pathBuilder{}
	pb.moveTo(waistCF).
		curveTo(cc1, cc2, crotchPt).
		lineTo(hemInseam).
		lineTo(hemSide).
		curveTo(sc1, sc2, waistSide).
		lineTo(waistCF).
		close()

	width := round1(hipBulge.x)
	height := round1(legLen)

	return Piece{
		Name:     name,
		PathData: pb.String(),
		Width:    width,
		Height:   height,
		Notes:    "Full piece, cut twice and mirrored (one per leg) — not on fold. Basic straight-leg block with no waist darts; refine the waist-to-hip fit with a muslin toile before cutting production fabric.",
	}
}

// draftWaistband drafts the straight waistband strip shared by
// trousers and skirts. frontQWaist/backQWaist are each panel's waist
// edge width; the finished band covers both panels on both sides plus
// a small closure allowance.
func draftWaistband(frontQWaist, backQWaist float64) Piece {
	closure := 3.0 // cm, button/hook overlap allowance
	length := (frontQWaist+backQWaist)*2 + closure
	height := 4.0

	pb := &pathBuilder{}
	pb.moveTo(point{0, 0}).
		lineTo(point{round1(length), 0}).
		lineTo(point{round1(length), round1(height)}).
		lineTo(point{0, round1(height)}).
		close()

	return Piece{
		Name:     "Waistband",
		PathData: pb.String(),
		Width:    round1(length),
		Height:   round1(height),
		Notes:    "Straight strip, cut on the fold lengthwise (or cut two and seam) to finished height. Includes a small closure overlap.",
	}
}

// DraftTrousers returns [front, back, waistband] for a straight-leg
// trouser block. Passing a short m.Inseam (and this package's default
// Rise) drafts shorts instead — same construction, shorter leg — so
// callers pick the style by measurement, not a separate code path.
func DraftTrousers(m Measurements, name string) []Piece {
	m = m.withDefaults()
	front := draftTrouserPanel(m, 0.15, 1.0, name+" front")
	back := draftTrouserPanel(m, 0.28, 1.03, name+" back")
	qWaist := m.Waist/4 + m.Ease/4
	waistband := draftWaistband(qWaist, qWaist)
	return []Piece{front, back, waistband}
}

// draftSkirtPanel drafts a dartless A-line skirt panel — front or
// back, both the same construction here (a basic block, not
// distinguishing the two beyond hipFactor for a touch more back
// width). On the fold at center front/back, like the bodice.
func draftSkirtPanel(m Measurements, hipFactor float64, name string) Piece {
	ease := m.Ease
	qHip := m.Hip/4 + ease/4*hipFactor
	hipDepth := clamp(m.SkirtLength*0.35, 8, 22)
	flarePerCm := 0.15 // how much the hem widens per cm below the hip line
	hemWidth := qHip + (m.SkirtLength-hipDepth)*flarePerCm

	waistTop := point{0, 0}
	hipPt := point{round1(qHip), round1(hipDepth)}
	hemPt := point{round1(hemWidth), round1(m.SkirtLength)}
	bottomCenter := point{0, round1(m.SkirtLength)}

	wc1 := point{0, round1(hipDepth * 0.3)}
	wc2 := point{round1(qHip * 0.7), round1(hipDepth * 0.7)}

	pb := &pathBuilder{}
	pb.moveTo(waistTop).
		curveTo(wc1, wc2, hipPt).
		lineTo(hemPt).
		lineTo(bottomCenter).
		lineTo(waistTop).
		close()

	return Piece{
		Name:     name,
		PathData: pb.String(),
		Width:    round1(hemWidth),
		Height:   round1(m.SkirtLength),
		FoldEdge: "left",
		Notes:    "Half panel, center front/back (left edge) on fold. Dartless A-line — the flare provides ease instead of waist shaping. Refine with a muslin toile.",
	}
}

// DraftSkirt returns [front, back, waistband] for a basic dartless
// A-line skirt block.
func DraftSkirt(m Measurements) []Piece {
	m = m.withDefaults()
	front := draftSkirtPanel(m, 1.0, "Skirt front")
	back := draftSkirtPanel(m, 1.05, "Skirt back")
	qWaist := m.Waist/4 + m.Ease/4
	waistband := draftWaistband(qWaist, qWaist)
	return []Piece{front, back, waistband}
}
