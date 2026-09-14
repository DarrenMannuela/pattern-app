// Shirt-level drafting: combines the front/back/sleeve pieces already
// built in draft.go and child.go with two new pieces (collar,
// placket) into the two garment types a konveksi actually cuts most:
// a collared school uniform shirt and a dartless PE/polo shirt.
package draft

// ShirtOptions selects how DraftShirt builds the torso and which
// extra pieces to include.
type ShirtOptions struct {
	// Style is "fitted" (bust dart, tailored through the waist) or
	// "relaxed" (dartless, more ease — the PE/polo construction).
	// Anything other than "relaxed" is treated as "fitted".
	Style string
	// DartPosition only matters when Style == "fitted"; see
	// DartPositions. Ignored for "relaxed".
	DartPosition string
	// Collar adds a one-piece convertible collar and a center-front
	// button placket — the school-shirt pieces a pullover-style PE
	// shirt doesn't have.
	Collar bool
}

// DraftShirt returns [front, back, sleeve] and, when opts.Collar is
// set, [..., collar, placket] — the full cut set for one shirt style
// at one size.
func DraftShirt(m Measurements, opts ShirtOptions) []Piece {
	m = m.withDefaults()

	ease := m.Ease
	qBust := m.Bust/4 + ease/4
	qWaist := m.Waist/4 + ease/4
	scye := m.Bust/4 + 2.5
	neckW := m.Neck / 5

	var front, back Piece
	var frontArmhole, backArmhole, frontNeck, backNeck float64

	if opts.Style == "relaxed" {
		front, frontArmhole, frontNeck = draftRelaxedFront(qBust, scye, neckW, m.Shoulder, m.BackWaistLength, "Shirt front")
		back, backArmhole, backNeck = draftRelaxedBack(qBust, scye, neckW, m.Shoulder, m.BackWaistLength, "Shirt back")
	} else {
		dartPosition := validDartPosition(opts.DartPosition)
		front, frontArmhole, frontNeck = draftFront(qBust, qWaist, scye, neckW, m.Shoulder, m.BackWaistLength, dartPosition)
		back, backArmhole, backNeck = draftBack(qBust, qWaist, scye, neckW, m.Shoulder, m.BackWaistLength)
	}

	sleeve := draftSleeve(frontArmhole+backArmhole, m.SleeveLength, m.UpperArm, m.Wrist, ease, "Sleeve")
	pieces := []Piece{front, back, sleeve}

	if opts.Collar {
		collar := draftCollar(frontNeck + backNeck)
		placket := draftPlacket(front.Height)
		pieces = append(pieces, collar, placket)
	}

	return pieces
}

// draftCollar drafts a half (center-back-on-fold) one-piece
// convertible collar — the simplest shirt collar to cut, common on
// konveksi seragam work. neckLen is the front+back neckline arc
// length (one side, matching how front/back are already half
// pieces), which fixes the collar's neck-edge length to the actual
// garment instead of guessing a width.
func draftCollar(neckLen float64) Piece {
	width := 6.5 // collar band width, cm — a standard shirt-collar proportion
	pointLen := width * 0.8

	cbBottom := point{0, 0}
	cbTop := point{0, round1(width)}
	cfNeck := point{round1(neckLen), round1(width * 0.1)} // neck edge rises slightly toward center front, like a real collar stand
	tip := point{round1(neckLen + pointLen), round1(width * 0.45)}
	cfOuter := point{round1(neckLen), round1(width)}

	nc1 := point{round1(neckLen * 0.35), round1(-width * 0.05)}
	nc2 := point{round1(neckLen * 0.75), round1(width * 0.02)}
	oc1 := point{round1(neckLen * 0.75), round1(width * 1.02)}
	oc2 := point{round1(neckLen * 0.3), round1(width * 1.05)}

	pb := &pathBuilder{}
	pb.moveTo(cbBottom).
		curveTo(nc1, nc2, cfNeck).
		lineTo(tip).
		lineTo(cfOuter).
		curveTo(oc1, oc2, cbTop).
		lineTo(cbBottom).
		close()

	return Piece{
		Name:     "Collar",
		PathData: pb.String(),
		Width:    round1(neckLen + pointLen),
		Height:   round1(width),
		FoldEdge: "left",
		Notes:    "Half collar, center back (left edge) on fold. Cut twice (outer collar + under-collar/interfacing) per shirt. Basic one-piece convertible collar — not a separate stand-and-fall two-piece collar.",
	}
}

// draftPlacket drafts the center-front button placket as a straight
// folded strip running the full front length.
func draftPlacket(frontHeight float64) Piece {
	width := 3.5 // finished placket width, cm

	pb := &pathBuilder{}
	pb.moveTo(point{0, 0}).
		lineTo(point{round1(width), 0}).
		lineTo(point{round1(width), round1(frontHeight)}).
		lineTo(point{0, round1(frontHeight)}).
		close()

	return Piece{
		Name:     "Placket",
		PathData: pb.String(),
		Width:    round1(width),
		Height:   round1(frontHeight),
		Notes:    "Straight strip, folds along center front to face the button/buttonhole line. Cut two (or one strip twice as wide, folded) per shirt.",
	}
}
