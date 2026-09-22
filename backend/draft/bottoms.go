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

import "math"

// draftTrouserPanel drafts one leg panel — front or back — the way a
// trouser block is drawn: the center line (CF/CB) runs straight down from the
// waist to the start of the crotch curve, the crotch extension reaches out
// beyond it (a little on the front, a lot on the back, where the seat needs
// the room), the inseam and side seam run straight through the knee to the
// hem, and the side seam curves in to the waist above the hip. It is a full
// piece cut twice and mirrored for the two legs, not on a fold.
//
// Proportions follow the standard block: hip line about 74% of the way to
// the crotch line, knee line halfway between crotch and hem less 2.5cm, crotch
// extension 11% of the quarter hip on the front and 32% on the back, the
// back rising above the front at the waist with its center line leaning
// outward, and a hem about 75% of the width at the thigh.
//
// Pattern coordinates: x = 0 is the crotch point (the widest reach of the
// extension) and the center line sits at x = ext, so every point is
// non-negative; the Landmarks say where the center line is.
func draftTrouserPanel(m Measurements, isBack bool, legStyle string, elastic bool, name string) Piece {
	ease := m.Ease
	qWaist := m.Waist/4 + ease/4
	qHip := m.Hip/4 + ease/4
	rise := m.Rise
	legLen := rise + m.Inseam
	hipY := clamp(rise*0.74, 8, rise-3)

	extFactor, dropIn := 0.11, 9.0
	if isBack {
		extFactor, dropIn = 0.32, 13.0
	}
	ext := round1(qHip * extFactor)
	cfX := ext

	// Waist: the back's center line leans out and the waist dips toward
	// the side seam; the front's is level. Darts take up the difference
	// between waist and hip.
	dartTotal := clamp((qHip-qWaist)*0.35, 0, 3)
	if isBack {
		dartTotal = clamp((qHip-qWaist)*0.6, 0, 5)
	}
	waistCF := point{cfX, 0}
	waistY := 0.0
	if isBack {
		waistCF = point{round1(cfX - 2.2), 0}
		waistY = 1.5
	}
	if elastic {
		// A pull-on has to pass over the hips: the top edge is nearly as wide as
		// the hip, gathered by the elastic, with no darts and no shaped waist.
		qWaist = qHip * pullOnWaistShare
		dartTotal = 0
		waistCF = point{cfX, 0}
		waistY = 0
	}
	waistSide := point{round1(waistCF.x + qWaist + dartTotal), round1(waistY)}
	hipSide := point{round1(cfX + qHip), round1(hipY)}

	// The side seam eases from the waist out to the hip.
	sideC1 := point{round1(waistSide.x + (hipSide.x-waistSide.x)*0.15), round1(waistSide.y + (hipSide.y-waistSide.y)*0.45)}
	sideC2 := point{hipSide.x, round1(hipSide.y - (hipSide.y-waistSide.y)*0.35)}

	// The leg hangs from a center line that sits the same distance from
	// the center front/back line on both panels (so the two panels' legs
	// line up when sewn): halfway between the front crotch point and the
	// front side seam. The back's hem is 2cm wider than the front's.
	frontReach := qHip * (1 + 0.11)
	legMid := cfX + frontReach/2 - qHip*0.11
	hemW := m.HemWidth
	if hemW == 0 {
		hemW = frontReach * legStyleFactor(legStyle, m.Inseam < 40)
	}
	if isBack {
		hemW += 2
	}
	kneeW := hemW + 3
	kneeY := rise + m.Inseam*0.5 - 2.5
	hasKnee := m.Inseam >= 32

	crotchPt := point{0, round1(rise)}
	crotchStart := point{cfX, round1(math.Max(hipY, rise-dropIn))}
	hemInseam := point{round1(legMid - hemW/2), round1(legLen)}
	hemSide := point{round1(legMid + hemW/2), round1(legLen)}
	kneeInseam := point{round1(legMid - kneeW/2), round1(kneeY)}
	kneeSide := point{round1(legMid + kneeW/2), round1(kneeY)}

	pb := &pathBuilder{}
	pb.moveTo(waistCF).
		lineTo(crotchStart).
		curveTo(point{cfX, round1(rise - 1)}, point{round1(cfX * 0.4), round1(rise)}, crotchPt)
	if hasKnee {
		pb.lineTo(kneeInseam)
	}
	pb.lineTo(hemInseam).
		lineTo(hemSide)
	if hasKnee {
		pb.lineTo(kneeSide)
	}
	pb.lineTo(hipSide).
		curveTo(sideC2, sideC1, waistSide).
		lineTo(waistCF).
		close()

	if !hasKnee {
		kneeInseam, kneeSide = hemInseam, hemSide
	}
	lm := map[string]Point{
		"waistCF":     {X: waistCF.x, Y: waistCF.y},
		"waistSide":   {X: waistSide.x, Y: waistSide.y},
		"hipSide":     {X: hipSide.x, Y: hipSide.y},
		"sideC1":      {X: sideC1.x, Y: sideC1.y},
		"sideC2":      {X: sideC2.x, Y: sideC2.y},
		"crotchStart": {X: crotchStart.x, Y: crotchStart.y},
		"crotchPt":    {X: crotchPt.x, Y: crotchPt.y},
		"kneeInseam":  {X: kneeInseam.x, Y: kneeInseam.y},
		"kneeSide":    {X: kneeSide.x, Y: kneeSide.y},
		"hemInseam":   {X: hemInseam.x, Y: hemInseam.y},
		"hemSide":     {X: hemSide.x, Y: hemSide.y},
		"centerLine":  {X: cfX, Y: 0},
	}
	// Dart tips: one on the front, two on the back, a third of the way in
	// from the center line (and two thirds).
	dartLen := 7.5
	// The width of each dart at the waist is stored beside its tip (as X of "dartNw").
	switch {
	case elastic:
	case isBack:
		dartLen = 11
		lm["dart1"] = Point{X: round1(waistCF.x + (waistSide.x-waistCF.x)*0.33), Y: dartLen}
		lm["dart2"] = Point{X: round1(waistCF.x + (waistSide.x-waistCF.x)*0.66), Y: dartLen}
		lm["dart1w"] = Point{X: round1(dartTotal / 2)}
		lm["dart2w"] = Point{X: round1(dartTotal / 2)}
	default:
		lm["dart1"] = Point{X: round1(waistCF.x + (waistSide.x-waistCF.x)*0.4), Y: dartLen}
		lm["dart1w"] = Point{X: round1(dartTotal)}
	}

	width := round1(math.Max(hipSide.x, math.Max(hemSide.x, waistSide.x)))
	return Piece{
		Name:      name,
		PathData:  pb.String(),
		Width:     width,
		Height:    round1(legLen),
		Notes:     "Full piece, cut twice and mirrored (one per leg) — not on fold. Center line is the vertical edge from the waist; the crotch extension curves out beyond it. Take the waist darts to the marked length, then refine the fit with a muslin before cutting production fabric.",
		Landmarks: lm,
	}
}

// pullOnWaistShare is how much of the quarter hip a pull-on trouser's top edge
// keeps before the elastic gathers it.
const pullOnWaistShare = 0.96

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

// draftElasticWaistband is the pull-on waistband: a ring as long as the top
// edges of the two panels, folded to make a casing for the elastic.
func draftElasticWaistband(frontTop, backTop float64) Piece {
	length := (frontTop + backTop) * 2
	return draftRectPiece("Waistband (elastic)", length, 9.5, "",
		"Cut 1 strip. Fold it in half lengthwise for a 4cm finished band (1.5cm of the height is seam allowance), sew the ends into a ring and sew it to the top edge of the trousers, leaving an opening to feed the elastic through. Two eyelets at center front for the drawstring.")
}

// TrouserOptions are the construction choices for trousers and shorts; the
// zero value is the default of each.
type TrouserOptions struct {
	// LegStyle: "slim", "straight" (default) or "wide" — how much the leg
	// narrows toward the hem.
	LegStyle string `json:"legStyle"`
	// FrontPocket: "slant" (default) or "none".
	FrontPocket string `json:"frontPocket"`
	// BackPocket: "welt" (default), "patch" or "none".
	BackPocket string `json:"backPocket"`
	// BeltLoops: "loops" (default) or "none".
	BeltLoops string `json:"beltLoops"`
	// Fly: "fly" (default, a zip fly with facing) or "plain".
	Fly string `json:"fly"`
	// Waist: "band" (default — a fitted waistband with darts, belt loops and a
	// fly) or "elastic" (a pull-on with an elastic waistband and drawstring, no
	// darts, belt loops or fly).
	Waist string `json:"waist"`
	// Stripe: "none" (default) or "side" (a contrast stripe down each outer
	// side seam, as on track and uniform trousers).
	Stripe string `json:"stripe"`
	// Length is the shorts length: "mini", "short" (default) or "knee".
	// Ignored for trousers, whose length is the size chart's inseam.
	Length string `json:"length"`
}

// ShortsInseam is the inseam, in cm, for a shorts length option; ok is
// false when the option is empty or unknown.
func ShortsInseam(length string) (cm float64, ok bool) {
	switch length {
	case "mini":
		return 10, true
	case "short":
		return 18, true
	case "knee":
		return 32, true
	}
	return 0, false
}

// legStyleFactor is the hem width as a share of the front thigh width.
func legStyleFactor(style string, short bool) float64 {
	if short {
		// Shorts don't taper to a hem: the leg opening stays close to the
		// width of the thigh.
		switch style {
		case "slim":
			return 0.8
		case "wide":
			return 1.0
		default:
			return 0.92
		}
	}
	switch style {
	case "slim":
		return 0.64
	case "wide":
		return 0.88
	default:
		return 0.72
	}
}

// DraftTrousers returns the cut set for a trouser block: front and back
// panels, waistband, and the detail pieces the options ask for. Passing a
// short m.Inseam drafts shorts instead — same construction, shorter leg —
// so callers pick the style by measurement, not a separate code path.
func DraftTrousers(m Measurements, name string, addOns AddOns, opts TrouserOptions) []Piece {
	m = m.withDefaults()
	elastic := opts.Waist == "elastic"
	front := draftTrouserPanel(m, false, opts.LegStyle, elastic, name+" front")
	back := draftTrouserPanel(m, true, opts.LegStyle, elastic, name+" back")
	qHip := m.Hip/4 + m.Ease/4
	pieces := []Piece{front, back}
	if elastic {
		top := qHip * pullOnWaistShare
		pieces = append(pieces, draftElasticWaistband(top, top))
		pieces = append(pieces,
			withQty(draftRectPiece("Waist elastic", m.Waist*0.85, 3, "", ""), 1, "Cut 1 of 3cm elastic, about 85% of the waist, joined into a ring and threaded through the waistband."),
			withQty(draftRectPiece("Drawstring", m.Waist+50, 1, "", ""), 1, "Cut 1 cord, threaded through two eyelets at center front of the waistband and knotted at the ends."))
	} else {
		qWaist := m.Waist/4 + m.Ease/4
		pieces = append(pieces, draftWaistband(qWaist, qWaist))
		if opts.BeltLoops != "none" {
			pieces = append(pieces, draftBeltLoop())
		}
	}
	if opts.FrontPocket != "none" {
		pieces = append(pieces, draftSlantPocketBag(qHip))
	}
	switch opts.BackPocket {
	case "none":
	case "patch":
		patch := draftPatchPocket(13, 14, 0, 0, "Patch pocket", "classic")
		patch.Notes = "Cut 2. Hem the top edge, press the other three sides under and topstitch to the back panel below the waist, centered on each half."
		pieces = append(pieces, patch)
	default:
		pieces = append(pieces, draftWeltStrip(), draftWeltPocketBag())
	}
	if opts.Fly != "plain" && !elastic {
		pieces = append(pieces, draftFlyFacing(m.Rise))
	}
	if opts.Stripe == "side" {
		pieces = append(pieces, contrastFabric(withQty(draftRectPiece("Side stripe", 3.2, m.Rise+m.Inseam, "", ""), 2,
			"Cut 2 in the contrast fabric (one per leg), 3.2cm wide, sewn over the outer side seam from the waistband to the hem and topstitched both sides.")))
	}

	pieces = append(pieces, draftAccessoryPockets(addOns.Accessories, &front, &back, nil)...)

	return pieces
}

// SkirtOptions are the construction choices for a skirt; the zero value is the
// default of each.
type SkirtOptions struct {
	// Style: "straight", "a_line" (default) or "flared" — how much the hem
	// widens below the hip.
	Style string `json:"style"`
	// Waist: "band" (default — darts, a waistband and a zip at center back)
	// or "elastic" (a pull-on skirt with an elastic casing and no darts).
	Waist string `json:"waist"`
	// Pocket: "none" (default) or "side" (an in-seam pocket at each side).
	Pocket string `json:"pocket"`
}

// skirtFlare is how much each quarter of the hem widens per cm of skirt
// below the hip line.
func skirtFlare(style string) float64 {
	switch style {
	case "straight":
		return 0
	case "flared":
		return 0.22
	}
	return 0.09
}

// draftSkirtPanel drafts one half panel of a skirt block, on the fold at
// center front/back, the way the standard block is drawn: hip line about a
// third of the way down (20cm on the adult charts), the circumference split
// so the back carries 1.2cm more than the front, the difference between hip
// and waist taken about half at the side seam and half in darts (one dart on
// the front, two longer ones on the back where the waist hollows), the
// front waistline dipping toward center front, and the hem lifted a little at
// the side seam and blended down to center. An A-line or flared skirt keeps
// the block from the hip up and widens the hem below it.
//
// Pattern coordinates: x = 0 is the fold (center front/back), y = 0 is the
// waist at the side seam (or the top of the elastic casing on a pull-on).
func draftSkirtPanel(m Measurements, isBack bool, o SkirtOptions, name string) Piece {
	elastic := o.Waist == "elastic"
	length := m.SkirtLength
	hipDepth := clamp(length*0.34, 9, 22)
	const split = 0.6

	qHip := (m.Hip+m.Ease)/4 - split
	if isBack {
		qHip += 2 * split
	}
	qWaist := m.Waist/4 + 0.5 - split
	if isBack {
		qWaist += 2 * split
	}
	if elastic {
		qWaist = qHip // a pull-on is cut to slip over the hips
	}
	diff := math.Max(0, qHip-qWaist)
	sideShare := 0.62
	if isBack {
		sideShare = 0.45
	}
	sideTake := diff * sideShare
	dartTotal := diff - sideTake
	if elastic {
		sideTake, dartTotal = 0, 0
	}
	sideWaistX := qHip - sideTake

	casing := 0.0
	yCF := 1.0
	if isBack {
		yCF = 0.6
	}
	if elastic {
		casing, yCF = 3.5, 0
	}
	hipY := casing + hipDepth
	hemX := qHip + skirtFlare(o.Style)*(length-hipDepth)
	if elastic {
		// A pull-on has no hip shaping: the skirt hangs (or flares) from the
		// top edge, which is already as wide as the hip.
		hemX = qHip + skirtFlare(o.Style)*length
	}
	total := casing + length

	// The casing is folded down from the top edge (y = 0), so it adds to the
	// length below the waist, not above the top.
	waistCF := point{0, round1(yCF)}
	waistSide := point{round1(sideWaistX), 0}
	waistC1 := point{round1(sideWaistX * 0.3), round1(yCF)}
	waistC2 := point{round1(sideWaistX * 0.72), round1(math.Min(0.15, yCF))}
	hipSide := point{round1(qHip), round1(hipY)}
	sideC1 := point{round1(sideWaistX + (qHip-sideWaistX)*0.35 + 0.3), round1(casing + hipDepth*0.35)}
	sideC2 := point{round1(qHip), round1(casing + hipDepth*0.7)}
	hemSide := point{round1(hemX), round1(total - 0.6)}
	hemCF := point{0, round1(total)}

	pb := &pathBuilder{}
	pb.moveTo(waistCF).
		curveTo(waistC1, waistC2, waistSide)
	if !elastic {
		pb.curveTo(sideC1, sideC2, hipSide)
	} else {
		hipSide = point{round1(qHip + (hemX-qHip)*(hipDepth/length)), round1(hipY)}
	}
	pb.lineTo(hemSide).
		curveTo(point{round1(hemX * 0.66), round1(total - 0.15)}, point{round1(hemX * 0.32), round1(total)}, hemCF).
		close()

	lm := map[string]Point{
		"waistCF":   {X: waistCF.x, Y: waistCF.y},
		"waistSide": {X: waistSide.x, Y: waistSide.y},
		"waistC1":   {X: waistC1.x, Y: waistC1.y},
		"waistC2":   {X: waistC2.x, Y: waistC2.y},
		"hipSide":   {X: hipSide.x, Y: hipSide.y},
		"hemSide":   {X: hemSide.x, Y: hemSide.y},
		"hemCF":     {X: hemCF.x, Y: hemCF.y},
	}
	notes := "Half panel, center front (left edge) on fold. Mark the dart, sew it closed and press toward the center, then join at the side seam."
	if isBack {
		notes = "Half panel, center back (left edge) on fold — or cut two with a seam and set an 18cm invisible zip in it. Mark the darts, sew them closed and press toward the center."
	}
	if elastic {
		lm["casing"] = Point{X: 0, Y: casing}
		notes = "Half panel, center " + map[bool]string{false: "front", true: "back"}[isBack] + " (left edge) on fold. Pull-on: fold the top 3.5cm down for the elastic casing and thread 2.5cm elastic."
	} else {
		// Darts: a third to a half of the way along the waist edge, taken
		// down about half to two thirds of the hip depth.
		add := func(n int, at, share, length float64) {
			w := dartTotal * share
			key := "dart" + string(rune('0'+n))
			lm[key] = Point{X: round1(sideWaistX * at), Y: round1(casing + length)}
			lm[key+"w"] = Point{X: round1(w), Y: 0}
		}
		if isBack {
			add(1, 0.38, 0.5, hipDepth*0.65)
			add(2, 0.7, 0.5, hipDepth*0.57)
		} else {
			add(1, 0.5, 1, hipDepth*0.5)
		}
	}

	return Piece{
		Name:      name,
		PathData:  pb.String(),
		Width:     round1(math.Max(hemX, qHip)),
		Height:    round1(total),
		FoldEdge:  "left",
		Notes:     notes,
		Landmarks: lm,
	}
}

// DraftSkirt returns the cut set for a skirt block: front and back panels,
// the waistband (or the elastic) and any pocket bags.
func DraftSkirt(m Measurements, addOns AddOns, o SkirtOptions) []Piece {
	m = m.withDefaults()
	front := draftSkirtPanel(m, false, o, "Skirt front")
	back := draftSkirtPanel(m, true, o, "Skirt back")
	pieces := []Piece{front, back}
	if o.Waist == "elastic" {
		pieces = append(pieces, withQty(draftRectPiece("Waist elastic", m.Waist*0.85, 2.5, "", ""), 1, "Cut 1 of 2.5cm elastic, about 85% of the waist, and join into a ring."))
	} else {
		w := m.Waist/4 + 0.5
		pieces = append(pieces, draftWaistband(w, w))
	}
	if o.Pocket == "side" {
		pieces = append(pieces, draftRectPiece("Side pocket bag", 16, 22, "", "Cut 4 (two per pocket). Sewn into the side seam, opening about 15cm below the waist."))
	}

	pieces = append(pieces, draftAccessoryPockets(addOns.Accessories, &front, &back, nil)...)

	return pieces
}
