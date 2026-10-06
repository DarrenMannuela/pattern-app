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
	// SleevePlacket finishes the opening above a cuff: "" or "tower" (the
	// pointed tower placket, default, as the shop makes it) or "bound" (a
	// narrow bound slit).
	SleevePlacket string `json:"sleevePlacket"`
	// Fit is how much room the shirt has round the chest, on top of the size
	// chart's wearing ease: "" (as the chart: ease only), "regular" (+6cm,
	// 12cm in all on the usual chart: a quarter of the chest + 3cm a panel,
	// the konveksi kemeja "medium fit" — jarumjahit) or "loose" (+14cm, 20cm
	// in all: the Bunka men's shirt block, half the chest + 10).
	Fit string `json:"fit"`
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
	// BackStyle: "yoke" (default, a separate back yoke), "yoke_pleat" (a
	// yoke with a box pleat at centre back below it) or "plain" (one back
	// panel). Polo shirts are always plain.
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
	// ColorBlock cuts the top of the front and back from the contrast fabric:
	// "" (none), "straight" (across, at mid-armhole) or "v" (dipping to a V at
	// centre front). The back takes its yoke, or a straight block if it has
	// none. Not combined with an insert panel.
	ColorBlock string `json:"colorBlock"`
	// SleeveFabric: "main" (default) or "contrast" — cuts the sleeve (and its
	// cuff, on a long sleeve) from the garment's second fabric instead of the
	// torso's, so the cutting layout nests and quantifies it separately.
	SleeveFabric string `json:"sleeveFabric"`
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
	// MotifPatterns gives a band its own pattern, keyed by placement ("side"
	// for the insert panel): a batik chest band with striped arm bands, say.
	// Bands not listed use Pattern.
	MotifPatterns map[string]string `json:"motifPatterns,omitempty"`
	// AddOns are extras independent of style/collar — a chest pocket,
	// an embroidery placement.
	// Block picks the shirt's cut: "" is the classic block below,
	// BlockKonveksi the shop's own uniform block (konveksi.go), sized by the
	// shop chart that Konveksi re-anchors.
	Block    string          `json:"block,omitempty"`
	Konveksi KonveksiOptions `json:"konveksi,omitempty"`
	AddOns   AddOns          `json:"addOns"`
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

// backPleat is how much a centre-back box pleat opens at the yoke seam:
// the extra width folded into it. The shop's own size-L kemeja opens 3cm.
const backPleat = 3.0

// addBackPleat widens the back panel at centre back (its fold) by half the
// pleat on this half — the whole pleat once cut on the fold — from the yoke
// seam down to the hem, so the pleat hangs open below the yoke and the back
// can spread when the arms reach forward. The yoke is unchanged: the back's
// top edge is longer than the yoke's by the pleat, folded in where they're
// sewn. The drawing keeps the sewn shape (Outline).
func addBackPleat(back Piece, pleat float64) Piece {
	o, ok := parseOutline(back.PathData)
	if !ok {
		return back
	}
	wider, _, ok := o.extendLeft(pleat / 2)
	if !ok {
		return back
	}
	if back.Outline == "" {
		back.Outline = back.PathData
	}
	back.PathData = wider.path()
	lm := make(map[string]Point, len(back.Landmarks)+1)
	for k, v := range back.Landmarks {
		lm[k] = v
	}
	lm["pleat"] = Point{X: pleat}
	back.Landmarks = lm
	back.Notes += fmt.Sprintf(" Box pleat at centre back: the back is cut %.0fcm wider at the fold. Lay the extra as a box pleat centred on centre back, stitch it into the yoke seam, and leave it open below.", pleat)
	return back
}

// fitEase is the chest ease a shirt's Fit adds to the size chart's.
func fitEase(fit string) float64 {
	switch fit {
	case "regular":
		return 6
	case "loose":
		return 14
	}
	return 0
}

// DraftShirtSize drafts one size of a shirt. The size's label matters only
// to the shop's uniform block, which sizes chart sizes (S, M, L...) by the
// shop chart rather than by their measurements.
func DraftShirtSize(label string, m Measurements, opts ShirtOptions) []Piece {
	if opts.Block == BlockKonveksi && opts.CollarStyle != "polo" {
		return wholeCollars(draftKonveksiShirt(konveksiSpecFor(label, m, opts.Konveksi), m, opts))
	}
	return wholeCollars(DraftShirt(m, opts))
}

// wholeCollars marks every collar piece to be cut as one whole piece, as the
// shop cuts them, rather than a half on the fold. They stay drafted as halves
// (centre back at x = 0); Finish unfolds the cutting line.
func wholeCollars(ps []Piece) []Piece {
	for i := range ps {
		p := &ps[i]
		if p.FoldEdge != "left" || !strings.Contains(strings.ToLower(p.Name), "collar") {
			continue
		}
		p.CutFull = true
		p.Notes = strings.NewReplacer(
			"Half collar", "Collar",
			"Half spread-collar", "Spread-collar",
			"Half Peter Pan collar", "Peter Pan collar",
			", center back (left edge) on fold.", ", cut as one whole piece (not on a fold).",
			", on the fold.", ", whole (not on a fold).",
			" on the fold.", " whole (not on a fold).",
		).Replace(p.Notes)
	}
	return ps
}

// DraftShirt returns [front, back, sleeve] and, when opts.Collar is
// set, [..., collar, placket] — the full cut set for one shirt style
// at one size.
func DraftShirt(m Measurements, opts ShirtOptions) []Piece {
	hipGiven := m.Hip > 0 // the default hip is an adult's: no use for sizing a child's hem
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
		if opts.Fit == "" {
			ease += 4 // a male cut was always drafted a little roomier
		}
		shoulderLen += 1.5
	}
	ease += fitEase(opts.Fit)

	qBust := m.Bust/4 + ease/4
	// The waist gets half the chest's ease, as in the Bunka block (half the
	// bust + 6, half the waist + 3).
	qWaist := m.Waist/4 + ease/8
	// A shirt hangs to the hip, so its hem has to go over it. The reference
	// charts' hems are as wide as the chest, which on the boys' size 8 is 2cm
	// over the hip; the hem is kept at least that, and where the hip is wider
	// than the chest the side seam flares out to it.
	qHem := (m.Hip + 2) / 4
	if !hipGiven {
		qHem = 0
	}
	scye := shirtScye(m.Bust)
	neckW := m.Neck / 5

	var front, yoke, back Piece
	var frontArmhole, backArmhole, frontNeck, backNeck float64
	isPolo := opts.CollarStyle == "polo"
	opensDown := false // a front that buttons all the way down: gets its button extension at the end

	if isPolo {
		// A knit polo has no back yoke — the back is one panel.
		front, frontArmhole, frontNeck = draftRelaxedFront(m.Bust, qBust, scye, neckW, shoulderLen, m.shirtLen(), qHem, "Shirt front")
		back, backArmhole, backNeck = draftRelaxedBack(m.Bust, qBust, scye, neckW, shoulderLen, m.shirtLen(), qHem, "Shirt back")
	} else if opts.Gender == "female" {
		qHip := m.Hip/4 + ease/4
		if !hipGiven {
			qHip = qBust // no hip measured: shape the hip as wide as the chest
		}
		spec := fittedSpec{bust: m.Bust, qBust: qBust, qWaist: qWaist, qHip: qHip, scye: scye, neckW: neckW, shoulderLen: shoulderLen,
			waistLen: m.BackWaistLength, length: m.shirtLen(), dartPosition: opts.DartPosition, shirttail: opts.HemStyle != "straight"}
		front, frontArmhole, frontNeck = draftFittedFront(spec)
		yoke, back, backArmhole, backNeck = draftFittedBack(spec, opts.BackStyle != "plain")
	} else {
		front, frontArmhole, frontNeck = draftRelaxedFront(m.Bust, qBust, scye, neckW, shoulderLen, m.shirtLen(), qHem, "Shirt front")
		if opts.BackStyle == "plain" {
			back, backArmhole, backNeck = draftRelaxedBack(m.Bust, qBust, scye, neckW, shoulderLen, m.shirtLen(), qHem, "Shirt back")
		} else {
			yoke, back, backArmhole, backNeck = draftRelaxedBackWithYoke(m.Bust, qBust, scye, neckW, shoulderLen, m.shirtLen(), qHem)
		}
	}
	if !isPolo && opts.Gender != "female" && opts.HemStyle != "straight" { // the fitted block curves its own hem
		front, back = curveHem(front), curveHem(back)
	}
	if opts.BackStyle == "yoke_pleat" && yoke.PathData != "" {
		back = addBackPleat(back, backPleat)
	}
	// A classic pique polo keeps its straight-across hem even when the
	// maker's own Hem choice isn't offered for it — a polo's hem is
	// conventionally cut straight, not into a shirttail curve.
	vNeck := !isPolo && !opts.Collar && opts.Neckline == "v_neck"
	vDepth := round1(scye * vNeckDepthFactor)
	if vNeck {
		front = vNeckFront(front, vDepth)
	}

	// The sleeve length is shoulder to wrist, cuff included: a cuffed sleeve
	// is drafted that much shorter ("A–D = panjang lengan – lebar manset",
	// jarumjahit). It used to be drafted full length with the cuff added on.
	sleeveLen := m.SleeveLength
	if cuffed := !isPolo && opts.SleeveStyle != "half"; cuffed {
		sleeveLen -= cuffDepth / sleeveLengthFraction(opts.SleeveStyle)
	}
	// The sleeve is sized from the shirt's own shoulder width — across the
	// back, shoulder point to shoulder point, as drafted (on the yoke when
	// there is one) — the measure the konveksi rule is written in. A real
	// size-L kemeja from the shop (shoulder 46) has exactly the 44cm sleeve
	// the rule gives; estimating the width from the neck and the seam length
	// instead ignored the shoulder's slope and made the sleeve 2cm too wide.
	top := back
	if yoke.PathData != "" {
		top = yoke
	}
	shoulderWidth := 2 * (neckW + shoulderLen)
	if top.ShoulderTip != nil {
		shoulderWidth = 2 * top.ShoulderTip.X
	}
	sleeve := draftSleeve(frontArmhole+backArmhole, sleeveLen, m.UpperArm, m.Wrist, ease, shoulderWidth, opts.SleeveStyle, "Sleeve")
	if opts.SleeveFabric == "contrast" {
		sleeve.Fabric = "contrast"
	}
	pieces := []Piece{front, yoke, back, sleeve}
	if yoke.PathData == "" {
		pieces = []Piece{front, back, sleeve}
	}
	if isPolo {
		// Left open at each side seam so the shirt sits better untucked — a
		// real, named feature of a classic pique polo, not just "no hem
		// curve"; ventTop lets the preview draw exactly where it starts.
		const poloVentRise = 5.0
		for _, p := range []*Piece{&front, &back} {
			if p.Landmarks == nil {
				p.Landmarks = map[string]Point{}
			}
			p.Landmarks["ventTop"] = Point{X: p.Width, Y: round1(p.Height - poloVentRise)}
			p.Notes += fmt.Sprintf(" Leave the last %.0fcm of each side seam open as a vent and bar-tack both ends.", poloVentRise)
		}
		pieces = []Piece{front, back, sleeve}
		if opts.SleeveStyle == "half" {
			rib := draftSleeveRib(sleeve.Width)
			if opts.SleeveFabric == "contrast" {
				rib.Fabric = "contrast"
			}
			pieces = append(pieces, rib)
		}
	} else if opts.SleeveStyle != "half" {
		// Every long-sleeve reference shirt has a buttoned cuff and a
		// slit above it — cut from the same fabric as the sleeve itself.
		cuff := draftCuff(m.Wrist)
		opening := []Piece{draftCuffSlit(m.SleeveLength)}
		if opts.SleevePlacket != "bound" {
			tower, underlap := draftCuffTower(m.SleeveLength)
			opening = []Piece{tower, underlap}
		}
		if opts.SleeveFabric == "contrast" {
			cuff.Fabric = "contrast"
			for i := range opening {
				opening[i].Fabric = "contrast"
			}
		}
		pieces = append(pieces, cuff)
		pieces = append(pieces, opening...)
	}

	if opts.Collar {
		var collarPieces []Piece
		switch opts.CollarStyle {
		case "polo":
			collar := draftPoloCollar(frontNeck + backNeck)
			if opts.Trim == "contrast" {
				// A real pique polo's contrast almost always sits in its knit
				// collar (and cuffs — see SleeveFabric), not a piped edge, which
				// isn't how a polo's collar is finished at all.
				collar.Fabric = "contrast"
			}
			collarPieces = []Piece{collar}
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
		if opts.Trim == "contrast" && opts.CollarStyle != "polo" {
			pieces = append(pieces, neckTrimPieces(false, "contrast", neckW, vDepth, (frontNeck+backNeck)*1.1+16)...)
		}
	}
	if opts.Collar || vNeck {
		// The placket runs the length of the centre-front edge it is sewn
		// to: from the neckline (or a V-neck's point) down to the hem at
		// centre front — not from the shoulder, which made it 7.5cm too long.
		edgeBottom := front.Height
		if c, ok := front.Landmarks["hemCentre"]; ok {
			edgeBottom = c.Y
		}
		placketLen := round1(edgeBottom - pathStartY(front.PathData))
		switch {
		case isPolo:
			pieces = append(pieces, draftPoloPlacket(frontNeck))
		case opts.FrontStyle == "plain":
		case opts.FrontStyle == "half_placket":
			pieces = append(pieces, draftPlacket(round1(front.Height*halfPlacketFraction)))
		case opts.FrontStyle == "hidden_placket":
			p := draftPlacket(placketLen)
			p.Name = "Hidden placket"
			p.Notes = "Cut 2 (one per front) on the fold. A folded facing strip that hides the buttons behind the front edge, centred on the centre-front line."
			pieces = append(pieces, p)
		default:
			pieces = append(pieces, draftPlacket(placketLen))
		}
		// A front that opens all the way down is a left and a right front, not
		// a half on the fold: its centre-front edge needs a seam allowance for
		// the placket (or facing) to be sewn to. A pullover front (plain, half
		// placket, polo) stays one piece cut on the fold.
		if !isPolo && opts.FrontStyle != "plain" && opts.FrontStyle != "half_placket" {
			opensDown = true
			pieces[0].FoldEdge = ""
			pieces[0].Qty = 2
			pieces[0].Notes = strings.Replace(pieces[0].Notes, "Half front, center front (left edge) on fold", "Front, cut 2 (left and right, mirror images); the placket is sewn along the front edge (left)", 1)
		}
	}
	if vNeck {
		pieces = append(pieces, neckTrimPieces(true, opts.Trim, neckW, vDepth, 0)...)
	}
	if opts.Panel == "side" {
		if inner, panel, outer := insertPanelPieces(front); panel != nil {
			pieces[0].Qty = 1 // the plain half of the front; the panel side is cut in three
			if panel != nil {
				panel.Motif = opts.motifPattern("side")
				panel.Notes = "Cut 1 in the " + motifMaterial(panel.Motif) + ". It sits between the two front pieces of that side, shoulder to hem."
			}
			for _, pc := range []*Piece{inner, panel, outer} {
				if pc != nil {
					pieces = append(pieces, withQty(*pc, 1, ""))
				}
			}
		}
	}

	if (opts.ColorBlock == "straight" || opts.ColorBlock == "v") && opts.Panel != "side" && !isPolo {
		pieces = colorBlock(pieces, back, opts.ColorBlock)
	}

	pieces = append(pieces, motifPieces(front, back, sleeve, opts.Motifs, opts.motifPattern)...)

	// Pockets/embroidery on the "back" segment attach to the lower back
	// panel (below the yoke seam) — the yoke itself is too narrow and
	// too close to the neckline to carry a chest-height accessory.
	pieces = append(pieces, draftAccessoryPockets(opts.AddOns.Accessories, &front, &back, &sleeve)...)

	if opensDown {
		// The placket is as long as the front edge it is sewn to, as cut.
		if edge := addButtonExtension(pieces); edge > 0 {
			for i, p := range pieces {
				if p.Name == "Placket" || p.Name == "Hidden placket" {
					band := draftPlacket(edge)
					pieces[i].PathData, pieces[i].Height = band.PathData, band.Height
				}
			}
		}
	}
	return pieces
}

// buttonExtension is the lidah: how far a front that buttons reaches past
// centre front, so the left and right fronts lap over each other with the
// buttons on centre front. Every konveksi kemeja draft we have adds 1.5cm
// (jarumjahit.com "Pola Dasar Kemeja Pria": "Garis B dibuat dari titik A ke
// kiri 1,5cm. Fungsinya untuk kancing"; kursusjahityogya: "1,5 cm untuk
// tempat kancing").
const buttonExtension = 1.5

// placketWidth is a button placket's finished width: the band covers the
// lidah and as much again inside centre front, so it sits centred on
// centre front with the buttons down its middle.
const placketWidth = 2 * buttonExtension

// addButtonExtension draws the lidah onto every piece along the centre-front
// edge of a front that opens: the edge moves buttonExtension past centre
// front. (Last week's version cut these fronts back to the placket seam
// instead, which is not how a konveksi drafts a kemeja.) The drawing keeps
// the front to centre front (Outline). It returns the length of the main
// front's new edge, which the placket runs.
func addButtonExtension(pieces []Piece) (edge float64) {
	for i := range pieces {
		p := &pieces[i]
		if p.FoldEdge != "" || !strings.Contains(strings.ToLower(p.Name), "front") {
			continue
		}
		if off, ok := p.Landmarks["offset"]; ok && off.X > 0.05 {
			continue // cut from further out (the outer part beside an insert panel)
		}
		o, ok := parseOutline(p.PathData)
		if !ok {
			continue
		}
		extended, length, ok := o.extendLeft(buttonExtension)
		if !ok {
			continue
		}
		_, panel := p.Landmarks["shoulderTip"]
		if panel && p.Outline == "" {
			p.Outline = p.PathData
		}
		p.PathData = extended.path()
		p.Notes += fmt.Sprintf(" The front edge is %.2gcm past centre front: the button extension (lidah); buttons and buttonholes go on centre front.", buttonExtension)
		if panel {
			edge = round1(length)
		}
	}
	return edge
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
	width := placketWidth

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
		FoldEdge: "left",
		Notes:    "Straight strip, cut 2 (one per front) on the fold: folded in half lengthwise into a band, sewn to the front edge and centred on the centre-front line, where the buttons and buttonholes go.",
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
func draftRelaxedBackWithYoke(bust, qChest, scye, neckW, shoulderLen, backWaistLen, qHem float64) (yoke, lowerBack Piece, armholeLen, neckLen float64) {
	whole, armholeLen, neckLen := relaxedPanel(bust, qChest, scye, neckW, shoulderLen, backWaistLen, math.Max(qChest, qHem)+1.5, true)
	yoke, lowerBack = splitYoke(whole, scye)
	lowerBack.Notes = "Half back panel, center back (left edge) on fold. Joins the yoke above along a felled seam."
	return yoke, lowerBack, armholeLen, neckLen
}

// splitYoke cuts a half back across at the yoke seam: the yoke above
// (neckline, shoulder and the top of the armhole) and the back panel below.
// The panel keeps the whole back's coordinates, so its outline still lines
// up with the front; its landmarks carry over.
func splitYoke(whole Piece, scye float64) (yoke, lowerBack Piece) {
	o, ok := parseOutline(whole.PathData)
	if !ok || len(o.segs) < 4 {
		return Piece{}, whole
	}
	// segs: neckline, shoulder, the armhole's curves up to the underarm,
	// then the side seam, hem and centre line.
	lm := whole.Landmarks
	tip := point{lm["shoulderTip"].X, lm["shoulderTip"].Y}
	under := point{lm["underarm"].X, lm["underarm"].Y}
	armEnd := -1
	for i, sg := range o.segs {
		if dist2(sg.p, under) < 0.01 {
			armEnd = i
			break
		}
	}
	if armEnd < 2 {
		return Piece{}, whole
	}
	yokeDepth := clamp(scye*0.4, 6, 10) // below the nape — a standard real-shirt yoke depth
	seamY := round1(o.start.y + yokeDepth)
	above, below, at := splitAtY(tip, o.segs[2:armEnd+1], seamY)
	at = point{round1(at.x), seamY}

	y := outline{start: o.start}
	y.add(o.segs[0], o.segs[1]).add(above...)
	y.segs[len(y.segs)-1].p = at
	y.lineTo(point{0, seamY})

	// The side seam, hem and centre line down to the hem — not the whole
	// back's closing edge, which runs on up to the neck.
	rest := o.segs[armEnd+1:]
	if n := len(rest); n > 0 && dist2(rest[n-1].p, o.start) < 1e-4 {
		rest = rest[:n-1]
	}
	b := outline{start: point{0, seamY}}
	b.lineTo(at).add(below...).add(rest...).lineTo(point{0, seamY})

	yoke = Piece{
		Name:        "Yoke",
		PathData:    y.path(),
		Width:       round1(at.x),
		Height:      round1(seamY - o.start.y),
		FoldEdge:    "left",
		Notes:       "Half yoke, center back (left edge) on fold. Sewn to the lower back panel below (a felled seam) and to the front shoulder seams above.",
		ShoulderTip: whole.ShoulderTip,
		Landmarks:   map[string]Point{"neckPoint": lm["neckPoint"], "shoulderTip": lm["shoulderTip"], "yokeArm": {X: at.x, Y: at.y}},
	}
	lowerBack = whole
	lowerBack.Name = "Shirt back"
	lowerBack.PathData = b.path()
	lowerBack.Height = round1(whole.Height - seamY)
	lowerBack.ShoulderTip = nil
	lowerBack.Landmarks = map[string]Point{"yokeArm": {X: at.x, Y: at.y}, "underarm": lm["underarm"], "hemSide": lm["hemSide"], "hemCentre": lm["hemCentre"]}
	for k, v := range lm {
		if strings.HasPrefix(k, "waist") || strings.HasPrefix(k, "hip") {
			lowerBack.Landmarks[k] = v
		}
	}
	return yoke, lowerBack
}

// halfPlacketFraction is how far down the front a half placket runs.
const halfPlacketFraction = 0.42

// hemRise is how much higher a curved (shirttail) hem sits at the side
// seam than at center front: 4cm, as on the shop's own size-L kemeja.
const hemRise = 4.0

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
	// The curve leaves the side seam square to it and reaches centre front
	// square to that, so front and back (and the two halves) meet in one
	// smooth hem instead of a notch at the side seam.
	rep := fmt.Sprintf("L%.1f,%.1f C%.1f,%.1f %.1f,%.1f 0.0,%.1f L0.0,", x, y-hemRise, x*0.75, y-hemRise, x*0.4, y, y)
	p.PathData = p.PathData[:tailStart] + rep + p.PathData[m[1]:]
	if hs, ok := p.Landmarks["hemSide"]; ok {
		lm := make(map[string]Point, len(p.Landmarks))
		for k, v := range p.Landmarks {
			lm[k] = v
		}
		lm["hemSide"] = Point{X: hs.X, Y: round1(y - hemRise)}
		p.Landmarks = lm
	}
	return p
}

// motifPattern is the pattern of one motif placement: its own if it has one,
// else the shirt's.
func (o ShirtOptions) motifPattern(placement string) string {
	if p := o.MotifPatterns[placement]; p != "" {
		return p
	}
	if o.Pattern == "" {
		return "solid"
	}
	return o.Pattern
}
