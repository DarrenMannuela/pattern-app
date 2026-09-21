// Shirt-level drafting: combines the front/back/sleeve pieces already
// built in draft.go and child.go with two new pieces (collar,
// placket) into the two garment types a konveksi actually cuts most:
// a collared school uniform shirt and a dartless PE/polo shirt.
package draft

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

// ShirtOptions selects how DraftShirt builds the torso and which
// extra pieces to include.
type ShirtOptions struct {
	// Gender picks the silhouette preset: "female" (bust dart,
	// tailored through the waist — the fitted/kupnat construction),
	// "male" (dartless with broadened chest/shoulder ease), or
	// "unisex" (dartless, standard ease — the neutral middle ground).
	// Anything other than "female" or "male" is treated as "unisex",
	// which is also DraftShirt's default when Gender is left blank —
	// a new order shouldn't silently read as gendered either way
	// until someone picks one.
	Gender string `json:"gender"`
	// DartPosition only matters when Gender == "female"; see
	// DartPositions. Ignored otherwise.
	DartPosition string `json:"dartPosition"`
	// SleeveStyle picks the sleeve length: "full" (to the wrist,
	// default), "three_quarter", or "half" (short sleeve) — see
	// sleeveLengthFraction.
	SleeveStyle string `json:"sleeveStyle"`
	// Collar adds a collar and a center-front button placket — the
	// school-shirt pieces a pullover-style PE shirt doesn't have.
	Collar bool `json:"collar"`
	// CollarStyle picks which collar shape Collar drafts:
	//   - "standing": a narrow band (mandarin) collar with no fold-over
	//     point, common on koko/PDH-style seragam — the only style
	//     that isn't a stand-plus-leaf two-piece construction.
	//   - "spread": a two-piece turn-down collar with a wider, longer,
	//     shallower point than the default (a spread/cutaway collar).
	//   - "peter_pan": a two-piece turn-down collar with a rounded
	//     outer edge and no point at all, common on children's shirts.
	//   - "polo": a flat knit polo collar with a short two-button
	//     placket and no yoke (see draftPoloCollar).
	//   - anything else (including ""): the default turn-down
	//     convertible collar, a standard moderate point.
	CollarStyle string `json:"collarStyle"`
	// FrontStyle picks the front opening: "placket" (button placket the
	// full length, default), "half_placket" (a short placket to about
	// mid-chest) or "plain" (no placket). Only applies with Collar.
	FrontStyle string `json:"frontStyle"`
	// BackStyle: "yoke" (default, a separate back yoke) or "plain" (one
	// back panel). Polo shirts are always plain.
	BackStyle string `json:"backStyle"`
	// HemStyle: "curved" (default, a shirttail hem a little higher at
	// the sides) or "straight". Polo shirts are always straight.
	HemStyle string `json:"hemStyle"`
	// Skirt construction choices (ignored for other garments); see SkirtOptions.
	Skirt SkirtOptions `json:"skirt"`
	// Custom is a design the user drew themselves (garment type "custom").
	Custom CustomOptions `json:"custom"`
	// Merch is the merchandise item builder (garment type "other").
	Merch MerchOptions `json:"merch"`
	// Trouser and shorts construction choices (ignored for shirts); see
	// TrouserOptions.
	Trousers TrouserOptions `json:"trousers"`
	// Neckline is "round" (default) or "v_neck". A V-neck only applies without
	// a collar (Collar false) and opens down the front like a placket shirt.
	Neckline string `json:"neckline"`
	// Trim: "none" (default) or "contrast" — a contrast-fabric binding round a
	// V-neck, or piping along the collar edge.
	Trim string `json:"trim"`
	// Panel: "none" (default) or "side" — a contrast insert panel down one
	// side of the front, from shoulder to hem.
	Panel string `json:"panel"`
	// Motifs are decorative bands laid on the shirt, any number of: see
	// MotifPlacements. Pattern says what they are made of: "solid" (default,
	// a plain contrast fabric), "stripes", "batik", "parang", "chevron", "dots"
	// or "check". It changes how the preview shows them and the cutting notes;
	// the pieces are the same whatever the pattern.
	Motifs  []string `json:"motifs"`
	Pattern string   `json:"pattern"`
	// AddOns are extras independent of style/collar — a chest pocket,
	// an embroidery placement.
	AddOns AddOns `json:"addOns"`
}

// shirtScye is the underarm depth measured down from the neck-point
// line. Both shirt charts in the reference set (the boys' size-8 shirt
// and the 5XL polo, chest 66 and 164) put the underarm at 0.254 and
// 0.256 of chest circumference, i.e. Bust/4 plus a fraction of a cm.
// The old Bust/4 + 2.5 drafted an armhole 2-5cm deeper than either
// chart, and reference_test.go now pins it.
func shirtScye(bust float64) float64 {
	return bust/4 + 0.5
}

// DraftShirt returns [front, back, sleeve] and, when opts.Collar is
// set, [..., collar, placket] — the full cut set for one shirt style
// at one size.
func DraftShirt(m Measurements, opts ShirtOptions) []Piece {
	m = m.withDefaults()

	ease := m.Ease
	shoulderLen := m.Shoulder
	// A male cut reads as broader through the chest and shoulder than
	// a dartless unisex cut of the same measurements — bumping ease
	// and shoulder length before the quarter-measurements are derived
	// widens the whole front/back/sleeve consistently, rather than
	// scaling one piece and leaving the others mismatched at the
	// shoulder/armhole seams.
	if opts.Gender == "male" {
		ease += 4
		shoulderLen += 1.5
	}

	qBust := m.Bust/4 + ease/4
	qWaist := m.Waist/4 + ease/4
	scye := shirtScye(m.Bust)
	neckW := m.Neck / 5

	var front, yoke, back Piece
	var frontArmhole, backArmhole, frontNeck, backNeck float64
	isPolo := opts.CollarStyle == "polo"

	if isPolo {
		// A knit polo has no back yoke — the back is one panel.
		front, frontArmhole, frontNeck = draftRelaxedFront(qBust, scye, neckW, shoulderLen, m.shirtLen(), "Shirt front")
		back, backArmhole, backNeck = draftRelaxedBack(qBust, scye, neckW, shoulderLen, m.shirtLen(), "Shirt back")
	} else if opts.Gender == "female" {
		dartPosition := validDartPosition(opts.DartPosition)
		front, frontArmhole, frontNeck = draftFront(qBust, qWaist, scye, neckW, shoulderLen, m.shirtLen(), dartPosition)
		if opts.BackStyle == "plain" {
			back, backArmhole, backNeck = draftBack(qBust, qWaist, scye, neckW, shoulderLen, m.shirtLen())
		} else {
			yoke, back, backArmhole, backNeck = draftBackWithYoke(qBust, qWaist, scye, neckW, shoulderLen, m.shirtLen())
		}
	} else {
		front, frontArmhole, frontNeck = draftRelaxedFront(qBust, scye, neckW, shoulderLen, m.shirtLen(), "Shirt front")
		if opts.BackStyle == "plain" {
			back, backArmhole, backNeck = draftRelaxedBack(qBust, scye, neckW, shoulderLen, m.shirtLen(), "Shirt back")
		} else {
			yoke, back, backArmhole, backNeck = draftRelaxedBackWithYoke(qBust, scye, neckW, shoulderLen, m.shirtLen())
		}
	}
	if !isPolo && opts.HemStyle != "straight" {
		front, back = curveHem(front), curveHem(back)
	}
	vNeck := !isPolo && !opts.Collar && opts.Neckline == "v_neck"
	vDepth := round1(scye * vNeckDepthFactor)
	if vNeck {
		front = vNeckFront(front, vDepth)
	}

	sleeve := draftSleeve(frontArmhole+backArmhole, m.SleeveLength, m.UpperArm, m.Wrist, ease, opts.SleeveStyle, "Sleeve")
	pieces := []Piece{front, yoke, back, sleeve}
	if yoke.PathData == "" {
		pieces = []Piece{front, back, sleeve}
	}
	if isPolo {
		pieces = []Piece{front, back, sleeve}
		if opts.SleeveStyle == "half" {
			pieces = append(pieces, draftSleeveRib(sleeve.Width))
		}
	} else if opts.SleeveStyle != "half" {
		// Every long-sleeve reference shirt has a buttoned cuff and a
		// slit above it.
		pieces = append(pieces, draftCuff(m.Wrist), draftCuffSlit(m.SleeveLength))
	}

	if opts.Collar {
		var collarPieces []Piece
		switch opts.CollarStyle {
		case "polo":
			collarPieces = []Piece{draftPoloCollar(frontNeck + backNeck)}
		case "standing":
			collarPieces = []Piece{draftStandingCollar(frontNeck + backNeck)}
		case "spread":
			collarPieces = []Piece{draftCollarStand(frontNeck + backNeck), draftSpreadCollarLeaf(frontNeck + backNeck)}
		case "peter_pan":
			collarPieces = []Piece{draftCollarStand(frontNeck + backNeck), draftPeterPanCollarLeaf(frontNeck + backNeck)}
		default:
			collarPieces = []Piece{draftCollarStand(frontNeck + backNeck), draftCollarLeaf(frontNeck + backNeck)}
		}
		pieces = append(pieces, collarPieces...)
		if opts.Trim == "contrast" {
			pieces = append(pieces, neckTrimPieces(false, "contrast", neckW, vDepth, (frontNeck+backNeck)*1.1+16)...)
		}
	}
	if opts.Collar || vNeck {
		placketLen := front.Height // a V-neck's placket starts at the point of the V
		if vNeck {
			placketLen = round1(front.Height - vDepth)
		}
		switch {
		case isPolo:
			pieces = append(pieces, draftPoloPlacket(frontNeck))
		case opts.FrontStyle == "plain":
		case opts.FrontStyle == "half_placket":
			pieces = append(pieces, draftPlacket(round1(front.Height*halfPlacketFraction)))
		case opts.FrontStyle == "hidden_placket":
			p := draftPlacket(placketLen)
			p.Name = "Hidden placket"
			p.Notes = "Cut 2. A folded facing strip that hides the buttons behind the front edge."
			pieces = append(pieces, p)
		default:
			pieces = append(pieces, draftPlacket(placketLen))
		}
	}
	if vNeck {
		pieces = append(pieces, neckTrimPieces(true, opts.Trim, neckW, vDepth, 0)...)
	}
	if opts.Panel == "side" {
		if inner, panel, outer := insertPanelPieces(front); panel != nil {
			pieces[0].Qty = 1 // the plain half of the front; the panel side is cut in three
			for _, pc := range []*Piece{inner, panel, outer} {
				if pc != nil {
					pieces = append(pieces, withQty(*pc, 1, ""))
				}
			}
		}
	}

	pieces = append(pieces, motifPieces(front, back, sleeve, opts.Motifs, opts.Pattern)...)

	// Pockets/embroidery on the "back" segment attach to the lower back
	// panel (below the yoke seam) — the yoke itself is too narrow and
	// too close to the neckline to carry a chest-height accessory.
	pieces = append(pieces, draftAccessoryPockets(opts.AddOns.Accessories, &front, &back, &sleeve)...)

	return pieces
}

// COLLAR PATTERN PIECES. Drawn from the collar reference sheet, not as
// strips: a collar wraps the neck, so its pieces are curved shapes —
// a crescent Peter Pan with a 7.5cm fold edge and a long convex outer
// edge, a band whose front end lifts into the tip, a leaf with a straight
// outer edge and a real point. The earlier pieces were 3-4cm near-straight
// rectangles that looked nothing like any of them.
//
// Each shape is stored in the sheet's own units (fold edge at x=0, one
// half of the collar) and scaled: length by how the order's neck compares
// with the sheet's, height gently (a child's collar isn't 4x shorter).

type refOp struct {
	c byte // 'M', 'L', 'C'
	v []float64
}

func refCollarPiece(name, notes, fold string, ops []refOp, sx, sy float64) Piece {
	scaled := func(shiftY float64) *pathBuilder {
		pb := &pathBuilder{}
		for _, o := range ops {
			pts := make([]point, 0, len(o.v)/2)
			for i := 0; i+1 < len(o.v); i += 2 {
				pts = append(pts, point{round1(o.v[i] * sx), round1(o.v[i+1]*sy - shiftY)})
			}
			switch o.c {
			case 'M':
				pb.moveTo(pts[0])
			case 'L':
				pb.lineTo(pts[0])
			case 'C':
				pb.curveTo(pts[0], pts[1], pts[2])
			}
		}
		pb.close()
		return pb
	}
	poly := flattenPath(scaled(0).String())
	minY, maxY, maxX := poly[0].y, poly[0].y, poly[0].x
	for _, q := range poly {
		minY, maxY, maxX = math.Min(minY, q.y), math.Max(maxY, q.y), math.Max(maxX, q.x)
	}
	return Piece{
		Name:     name,
		PathData: scaled(minY).String(),
		Width:    round1(maxX),
		Height:   round1(maxY - minY),
		FoldEdge: fold,
		Notes:    notes,
	}
}

func collarScale(neckLen, refLen float64) (sx, sy float64) {
	return (neckLen + 1) / refLen, clamp(neckLen/20, 0.75, 1.15)
}

// Band (reference 1: 15.7 straight, 4.5 high, front end lifting 3.5).
var bandOps = []refOp{
	{'M', []float64{0, 3.5}}, {'L', []float64{15.7, 3.5}},
	{'C', []float64{19, 3.5, 21.6, 1.6, 22.6, -0.3}}, {'L', []float64{23.2, 2.6}},
	{'C', []float64{20.4, 6.2, 18.6, 8, 15.7, 8}}, {'L', []float64{0, 8}},
}

func draftBandCollarPiece(neckLen, heightScale float64, name, notes string) Piece {
	sx, sy := collarScale(neckLen, 23.2)
	return refCollarPiece(name, notes, "left", bandOps, sx, sy*heightScale)
}

// draftStandingCollar is the mandarin/koko band collar (reference 1).
func draftStandingCollar(neckLen float64) Piece {
	return draftBandCollarPiece(neckLen, 1.0,
		"Standing collar",
		"Half band (mandarin) collar, center back (left edge) on fold. Cut twice (outer band + under-band/interfacing) per shirt. The front end lifts into the tip; meets at center front with a hook-and-eye or a single button, not a turn-down point.")
}

// draftCollarStand is the band under a turn-down collar's leaf — the
// same band shape as reference 1, shorter, because the leaf sewn on top
// carries the rest of the finished collar's height.
func draftCollarStand(neckLen float64) Piece {
	return draftBandCollarPiece(neckLen, 0.62,
		"Collar stand",
		"Half collar stand, center back (left edge) on fold. Cut twice (outer stand + under-stand/interfacing) per shirt. The collar leaf attaches along this piece's own top edge and folds down over it.")
}

// Classic shirt collar leaf (reference 3): straight outer edge, curved
// neck edge, a real point at the front.
var classicLeafOps = []refOp{
	{'M', []float64{0, 0}}, {'L', []float64{20.5, 0}}, {'L', []float64{23.4, 6.6}}, {'L', []float64{20, 5.8}},
	{'C', []float64{14, 6.6, 6, 5.8, 0, 5}},
}

// draftCollarLeaf drafts the fold-over pointed leaf of a turn-down collar.
func draftCollarLeaf(neckLen float64) Piece {
	sx, sy := collarScale(neckLen, 20.5)
	return refCollarPiece("Collar leaf",
		"Half collar leaf, center back (left edge) on fold. Cut twice (outer leaf + under-leaf/interfacing) per shirt. Sews to the collar stand's top edge and folds down over it.",
		"left", classicLeafOps, sx, sy)
}

// Spread / cutaway leaf: same construction with a longer, shallower point.
var spreadLeafOps = []refOp{
	{'M', []float64{0, 0}}, {'L', []float64{20.5, 0}}, {'L', []float64{26.2, 7.2}}, {'L', []float64{20, 5.6}},
	{'C', []float64{14, 6.4, 6, 5.6, 0, 5}},
}

func draftSpreadCollarLeaf(neckLen float64) Piece {
	sx, sy := collarScale(neckLen, 20.5)
	return refCollarPiece("Collar leaf",
		"Half spread-collar leaf, center back (left edge) on fold. Cut twice (outer leaf + under-leaf/interfacing) per shirt. Sews to the collar stand's top edge and folds down over it — a wider, shallower point than the standard leaf.",
		"left", spreadLeafOps, sx, sy)
}

// Peter Pan (references 2 and 5): a crescent — 7.5cm at the fold, a long
// convex outer edge sweeping round to the front, the neck edge straight
// for 4cm then curving down to meet it.
var peterPanOps = []refOp{
	{'M', []float64{0, 0}},
	{'C', []float64{8, 0, 15.6, 1.6, 18.4, 8}},
	{'C', []float64{18.9, 10.2, 18.6, 12.2, 17.6, 13.4}},
	{'C', []float64{13.5, 9.2, 8.2, 7.6, 4, 7.5}},
	{'L', []float64{0, 7.5}},
}

func draftPeterPanCollarLeaf(neckLen float64) Piece {
	sx, sy := collarScale(neckLen, 18.5)
	return refCollarPiece("Collar leaf",
		"Half Peter Pan collar leaf, center back (left edge) on fold. Cut twice (outer leaf + under-leaf/interfacing) per shirt. Rounded crescent, no point — the neck edge is straight for the first 4cm then curves to the front; sews to the collar stand's top edge.",
		"left", peterPanOps, sx, sy)
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

// draftRelaxedBackWithYoke drafts the dartless back the same way
// draftRelaxedBack (child.go) does, but as two pieces instead of one:
// a yoke covering the neckline, shoulder seam, and the top of the
// armhole down to a fixed depth below the nape, and the lower back
// panel below that seam. Every reference shirt has this seam — it's
// the standard way a shirt back is actually cut, not a stylistic
// choice — and stitching it as a felled seam is what lets the back
// panel be cut on the straight/lengthwise grain while the yoke, which
// sits over the shoulder blades, can be cut differently. armholeLen
// and neckLen describe the WHOLE original curve, unaffected by where
// the yoke seam happens to cross it, since a sleeve or collar sewn in
// later cares about the total curve length, not how many pieces
// currently make it up.
func draftRelaxedBackWithYoke(qChest, scye, neckW, shoulderLen, backWaistLen float64) (yoke, lowerBack Piece, armholeLen, neckLen float64) {
	height := backWaistLen
	neckDrop := neckW * 0.3
	shoulderDrop := 1.0
	shoulderTipX := neckW + shoulderLen*1.0
	backScye := scye // same bust line front and back, so the side seams true
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
	ac1 := point{round1(shoulderTip.x + (underarm.x-shoulderTip.x)*0.25 + 1.0), round1(shoulderTip.y + (underarm.y-shoulderTip.y)*0.15)}
	ac2 := point{round1(underarm.x + 1.0), round1(underarm.y - (underarm.y-shoulderTip.y)*0.3)}

	armholeLen = cubicLength(shoulderTip, ac1, ac2, underarm)
	neckLen = cubicLength(cbTop, nc1, nc2, neckPoint)

	yokeDepth := clamp(backScye*0.4, 6, 10) // below the nape — a standard real-shirt yoke depth
	splitT := tForY(shoulderTip, ac1, ac2, underarm, cbTop.y+yokeDepth)
	a, d, splitPt, e, c := splitCubic(shoulderTip, ac1, ac2, underarm, splitT)

	yokePb := &pathBuilder{}
	yokePb.moveTo(cbTop).
		curveTo(nc1, nc2, neckPoint).
		lineTo(shoulderTip).
		curveTo(a, d, splitPt).
		lineTo(point{0, splitPt.y}).
		lineTo(cbTop).
		close()

	lowerPb := &pathBuilder{}
	lowerPb.moveTo(point{0, splitPt.y}).
		lineTo(splitPt).
		curveTo(e, c, underarm).
		lineTo(hemSide).
		lineTo(cbBottom).
		lineTo(point{0, splitPt.y}).
		close()

	yoke = Piece{
		Name:        "Yoke",
		PathData:    yokePb.String(),
		Width:       round1(shoulderTip.x),
		Height:      round1(splitPt.y - cbTop.y),
		FoldEdge:    "left",
		Notes:       "Half yoke, center back (left edge) on fold. Sewn to the lower back panel below (a felled seam) and to the front shoulder seams above.",
		ShoulderTip: &Point{X: shoulderTip.x, Y: shoulderTip.y},
	}
	lowerBack = Piece{
		Name:     "Shirt back",
		PathData: lowerPb.String(),
		Width:    round1(width),
		Height:   round1(height - splitPt.y),
		FoldEdge: "left",
		Notes:    "Half back panel, center back (left edge) on fold. Joins the yoke above along a felled seam.",
	}
	return yoke, lowerBack, armholeLen, neckLen
}

// draftBackWithYoke is draftBack's (draft.go) counterpart for the
// fitted/dart preset — see draftRelaxedBackWithYoke's doc comment for
// why this seam exists at all. The waist dart lives entirely below
// the yoke seam (real fitted shirts put shaping darts in the lower
// back, not across the shoulder blades), so it's unaffected by the split.
func draftBackWithYoke(qBust, qWaist, scye, neckW, shoulderLen, backWaistLen float64) (yoke, lowerBack Piece, armholeLen, neckLen float64) {
	height := backWaistLen
	neckDrop := neckW * 0.35
	shoulderDrop := 1.3
	shoulderTipX := neckW + shoulderLen*1.0
	backScye := scye

	width := max2(qBust, shoulderTipX)

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

	nc1 := point{round1(cbTop.x), round1(neckDrop * 0.3)}
	nc2 := point{round1(neckW * 0.5), 0}
	ac1 := point{round1(shoulderTip.x + (underarm.x-shoulderTip.x)*0.25 + 1.2), round1(shoulderTip.y + (underarm.y-shoulderTip.y)*0.15)}
	ac2 := point{round1(underarm.x + 1.0), round1(underarm.y - (underarm.y-shoulderTip.y)*0.3)}

	armholeLen = cubicLength(shoulderTip, ac1, ac2, underarm)
	neckLen = cubicLength(cbTop, nc1, nc2, neckPoint)

	yokeDepth := clamp(backScye*0.4, 6, 10)
	splitT := tForY(shoulderTip, ac1, ac2, underarm, cbTop.y+yokeDepth)
	a, d, splitPt, e, c := splitCubic(shoulderTip, ac1, ac2, underarm, splitT)

	yokePb := &pathBuilder{}
	yokePb.moveTo(cbTop).
		curveTo(nc1, nc2, neckPoint).
		lineTo(shoulderTip).
		curveTo(a, d, splitPt).
		lineTo(point{0, splitPt.y}).
		lineTo(cbTop).
		close()

	lowerPb := &pathBuilder{}
	lowerPb.moveTo(point{0, splitPt.y}).
		lineTo(splitPt).
		curveTo(e, c, underarm).
		lineTo(sideWaist).
		lineTo(dartRight).
		lineTo(apex).
		lineTo(dartLeft).
		lineTo(cbBottom).
		lineTo(point{0, splitPt.y}).
		close()

	yoke = Piece{
		Name:        "Yoke",
		PathData:    yokePb.String(),
		Width:       round1(shoulderTip.x),
		Height:      round1(splitPt.y - cbTop.y),
		FoldEdge:    "left",
		Notes:       "Half yoke, center back (left edge) on fold. Sewn to the lower back panel below (a felled seam) and to the front shoulder seams above.",
		ShoulderTip: &Point{X: shoulderTip.x, Y: shoulderTip.y},
	}
	lowerBack = Piece{
		Name:     "Shirt back",
		PathData: lowerPb.String(),
		Width:    round1(width),
		Height:   round1(height - splitPt.y),
		FoldEdge: "left",
		Notes:    "Half back panel, center back (left edge) on fold. Small waist dart included. Joins the yoke above along a felled seam.",
	}
	return yoke, lowerBack, armholeLen, neckLen
}

// halfPlacketFraction is how far down the front a half placket runs.
const halfPlacketFraction = 0.42

// hemRise is how much higher a curved (shirttail) hem sits at the side
// seam than at center front.
const hemRise = 2.5

// The armhole curve followed directly by one straight side seam and a
// straight hem — i.e. a panel with no dart cut into its side or hem.
var straightHemTail = regexp.MustCompile(`C-?[\d.]+,-?[\d.]+ -?[\d.]+,-?[\d.]+ -?[\d.]+,-?[\d.]+ L(-?\d+\.?\d*),(-?\d+\.?\d*) L0\.0,(-?\d+\.?\d*) L0\.0,`)

// curveHem turns the straight hem of a front or back panel into a
// shirttail curve: the side seam ends hemRise higher and the hem sweeps
// down to center. Panels with a dart cut into the hem stay straight.
func curveHem(p Piece) Piece {
	m := straightHemTail.FindStringSubmatchIndex(p.PathData)
	if m == nil {
		return p
	}
	sx, sy, cy := p.PathData[m[2]:m[3]], p.PathData[m[4]:m[5]], p.PathData[m[6]:m[7]]
	tailStart := strings.Index(p.PathData[m[0]:], " L") + m[0] + 1
	if sy != cy {
		return p
	}
	x, _ := strconv.ParseFloat(sx, 64)
	y, _ := strconv.ParseFloat(sy, 64)
	rep := fmt.Sprintf("L%.1f,%.1f C%.1f,%.1f %.1f,%.1f 0.0,%.1f L0.0,", x, y-hemRise, x*0.85, y-hemRise*0.1, x*0.5, y, y)
	p.PathData = p.PathData[:tailStart] + rep + p.PathData[m[1]:]
	return p
}
