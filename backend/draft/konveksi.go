package draft

import (
	"fmt"
	"math"
	"strings"
)

// THE KONVEKSI UNIFORM BLOCK: the shop's own short-sleeve uniform shirt,
// taken off Dad's size-M paper patterns (October 2026), next to the classic
// block DraftShirt drafts. It is a different cut, not a different size: a
// closer chest, wider and much flatter shoulders with the shoulder seam set
// forward, a bigger armhole, and a flat, wide short sleeve with almost no
// ease in the cap. Changing one of those alone wouldn't sew, so the block
// carries its own geometry rather than tweaking the classic one.
//
// The shop sizes by its chart, not by body measurements: size M as drafted
// below, and each size up or down 3cm wider laid flat (6cm round), the way
// Dad grades the paper. The rest grows in proportion, following the usual
// menswear grade (per 4cm of chest: neck and across back +1cm, armhole a
// little under 1cm deeper, length about 1cm, sleeve 0.5cm), scaled to the
// shop's 6cm steps. A maker can re-anchor the chart: give one size's chest
// (and length) and every size up and down follows.

// BlockKonveksi selects this block in ShirtOptions.Block.
const BlockKonveksi = "konveksi"

// KonveksiOptions re-anchors the shop chart: Chest and Length are BaseSize's
// finished chest (all the way round) and length (from the shoulder by the
// neck down to the hem, how the app measures every shirt). Zero keeps the
// shop's numbers for that size.
type KonveksiOptions struct {
	BaseSize string  `json:"baseSize"`
	Chest    float64 `json:"chest"`
	Length   float64 `json:"length"`
}

// Size M, finished (seam allowances off). Widths across a half piece, depths
// down from the side neck point, as on the paper.
const (
	kChestM       = 98.0 // round: 49 laid flat, measured on the finished uniform
	kBackHalfM    = 26.5 // half the back at the underarm (the back is 53 across)
	kFrontM       = 22.5 // centre front to the side seam at the underarm
	kNeckWidthM   = 8.5  // centre line to the side neck point, front and back alike
	kFrontNeckM   = 8.3  // front neck depth
	kBackNeckM    = 1.2  // back neck depth
	kShoulderM    = 15.3 // front shoulder seam
	kFrontDrop    = 3.3  // the front shoulder drops this much over the seam...
	kBackDrop     = 2.1  // ...and the back this much: flatter than the classic 4.8 and 4.3
	kFrontArmM    = 22.4 // side neck point to the underarm, front
	kBackArmM     = 26.7 // and back: the shoulder seam sits about 2cm forward
	kLengthM      = 72.0 // back neck to hem
	kSleeveWidthM = 44.5 // across the sleeve at the underarm
	kSleeveHemM   = 39.5 // across the sleeve hem
	kSleeveLenM   = 26.0 // cap top to hem
	// A long sleeve, size L, across at the underarm, off Dad's long-sleeve
	// kemeja. The uniform's shoulders are wider and flatter than that shirt's,
	// so the shoulder rule draftSleeve uses (shoulder width less 2) would cut
	// an S wider than his L; long sleeves take his width, graded by the chart.
	kLongSleeveL = 44.0
	// The back shoulder seam is eased onto the front's: Dad's measures 0.2cm
	// longer; 0.4 keeps it clear of the 0.3 the seam checks count as eased.
	kShoulderEase = 0.4
	// The cap is barely longer than the armhole: a low, flat cap sets in
	// with little to ease (Dad's 51 on an armhole of 50, both as cut).
	kCapEase = 0.5
	// Collar: 5.1 high at the back, 4 at the front ends; its stiff inner
	// layer (kain keras) is 3.5 high and stops 2cm short of each end.
	kCollarBack      = 5.1
	kCollarFront     = 4.0
	kInterfacing     = 3.5
	kInterfacingStop = 2.0
	// The front opening: buttons on centre front, the edge 2.5 past it,
	// folded back 2.5 as a facing, and a 3.2 lidah sewn over the buttons.
	kOverlap = 2.5
	kFacing  = 2.5
	kLidah   = 3.2
	// Allowances on Dad's paper: 0.5 on seams, a 1.5 shirt hem, a 2.5 sleeve hem.
	kSeamAllow      = 0.5
	kHemAllow       = 1.5
	kSleeveHemAllow = 2.5
)

// What each size step adds (or, down, takes off).
const (
	kChestStep       = 6.0 // round, Dad's rule: 1.5 more on each side of each piece, 3 laid flat
	kNeckStep        = 0.25
	kFrontNeckStep   = 0.25
	kBackNeckStep    = 0.05
	kShoulderStep    = 0.5
	kArmholeStep     = 1.0
	kLengthStep      = 1.5
	kSleeveWidthStep = 1.5
	kSleeveHemStep   = 1.3
	kSleeveLenStep   = 0.5
	// A size not on the chart is placed by the person's chest: this much
	// room on top of it. The shop's M (98) then fits a 92cm chest.
	kBodyEase = 6.0
	// The chart is drafted from 3XS to 7XL; a chest beyond that is drafted
	// as the end of it (this block is for adults).
	kMinStep, kMaxStep = -5.0, 9.0
)

// konveksiSizes is the shop chart's order: M is step 0.
var konveksiSizes = map[string]int{
	"3XS": -4, "XXXS": -4, "2XS": -3, "XXS": -3, "XS": -2, "S": -1, "M": 0, "L": 1, "XL": 2,
	"2XL": 3, "XXL": 3, "3XL": 4, "XXXL": 4, "4XL": 5, "XXXXL": 5, "5XL": 6, "XXXXXL": 6, "6XL": 7, "7XL": 8,
}

// KonveksiSizeStep is a size label's place on the shop chart (M = 0), if it
// is a chart size.
func KonveksiSizeStep(label string) (int, bool) {
	n := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(label), " ", ""))
	i, ok := konveksiSizes[n]
	return i, ok
}

// konveksiSpec is one size of the block: how many chart steps it is from M
// across (widths) and its finished lengths.
type konveksiSpec struct {
	step      float64 // widths: (chest - 98) / 6
	length    float64 // back neck to hem
	sleeveLen float64 // cap top to hem
	onChart   bool
	clamped   bool
}

func konveksiSpecFor(label string, m Measurements, o KonveksiOptions) konveksiSpec {
	base, ok := KonveksiSizeStep(o.BaseSize)
	if !ok {
		base = 0
	}
	chest := o.Chest
	if chest <= 0 {
		chest = kChestM + kChestStep*float64(base)
	}
	// The base size's back length (back neck to hem), from the length given
	// at the side neck point, which sits the back neck's depth higher.
	length := kLengthM + kLengthStep*float64(base)
	if o.Length > 0 {
		length = o.Length - (kBackNeckM + kBackNeckStep*(chest-kChestM)/kChestStep)
	}
	var sp konveksiSpec
	if i, ok := KonveksiSizeStep(label); ok {
		d := float64(i - base)
		sp = konveksiSpec{
			step:      (chest-kChestM)/kChestStep + d,
			length:    length + kLengthStep*d,
			sleeveLen: kSleeveLenM + kSleeveLenStep*float64(i),
			onChart:   true,
		}
	} else {
		// Not a chart size: placed by the person's own chest, the length and
		// short sleeve taken as measured when given.
		bust := m.Bust
		if bust <= 0 {
			bust = chest - kBodyEase
		}
		sp.step = (bust + kBodyEase - kChestM) / kChestStep
		sp.length = length + kLengthStep*(sp.step-float64(base))
		if m.ShirtLength > 0 {
			sp.length = m.ShirtLength
		}
		sp.sleeveLen = kSleeveLenM + kSleeveLenStep*sp.step
		if m.SleeveLength > 0 && m.SleeveLength <= MaxShortSleeve {
			sp.sleeveLen = m.SleeveLength
		}
	}
	if sp.step < kMinStep || sp.step > kMaxStep {
		sp.step = clamp(sp.step, kMinStep, kMaxStep)
		sp.clamped = true
	}
	sp.length = clamp(sp.length, 45, 110)
	sp.sleeveLen = clamp(sp.sleeveLen, 15, MaxShortSleeve)
	return sp
}

// KonveksiChartRow is one size of the chart as the maker sees it.
type KonveksiChartRow struct {
	Size        string  `json:"size"`
	Chest       float64 `json:"chest"`
	Length      float64 `json:"length"`
	Shoulder    float64 `json:"shoulder"`
	SleeveWidth float64 `json:"sleeveWidth"`
	Sleeve      float64 `json:"sleeve"`
}

// KonveksiChart is the shop chart, XS to 3XL, for the given anchor: the
// finished sizes the pattern maker shows beside the anchor's inputs.
func KonveksiChart(o KonveksiOptions) []KonveksiChartRow {
	var rows []KonveksiChartRow
	for _, size := range []string{"XS", "S", "M", "L", "XL", "2XL", "3XL"} {
		sp := konveksiSpecFor(size, Measurements{}, o)
		g := konveksiGeometry(sp)
		rows = append(rows, KonveksiChartRow{
			Size:        size,
			Chest:       round1(2 * (g.backHalf + g.front)),
			Length:      round1(g.backNeck + sp.length), // at the side neck point
			Shoulder:    round1(2 * g.backTip.x),
			SleeveWidth: round1(2 * g.halfBicep),
			Sleeve:      round1(sp.sleeveLen),
		})
	}
	return rows
}

// konveksiGeom is one size's construction points, half pieces with the side
// neck point at y = 0.
type konveksiGeom struct {
	neckW, frontNeck, backNeck float64
	front, backHalf            float64
	frontTip, backTip          point
	frontUnderY, backUnderY    float64
	frontHemY, backHemY        float64
	halfBicep, halfHem         float64
}

func konveksiGeometry(sp konveksiSpec) konveksiGeom {
	s := sp.step
	g := konveksiGeom{
		neckW:       kNeckWidthM + kNeckStep*s,
		frontNeck:   kFrontNeckM + kFrontNeckStep*s,
		backNeck:    kBackNeckM + kBackNeckStep*s,
		front:       kFrontM + kChestStep/2*kFrontM/(kFrontM+kBackHalfM)*s,
		backHalf:    kBackHalfM + kChestStep/2*kBackHalfM/(kFrontM+kBackHalfM)*s,
		frontUnderY: kFrontArmM + kArmholeStep*s,
		backUnderY:  kBackArmM + kArmholeStep*s,
		halfBicep:   (kSleeveWidthM + kSleeveWidthStep*s) / 2,
		halfHem:     (kSleeveHemM + kSleeveHemStep*s) / 2,
	}
	seam := kShoulderM + kShoulderStep*s
	tip := func(seam, drop float64) point {
		drop = math.Min(drop, seam*0.5)
		return point{round1(g.neckW + math.Sqrt(seam*seam-drop*drop)), round1(drop)}
	}
	g.frontTip = tip(seam, kFrontDrop)
	g.backTip = tip(seam+kShoulderEase, kBackDrop)
	g.backHemY = g.backNeck + sp.length
	// The side seams are the same length front and back.
	g.frontHemY = g.frontUnderY + (g.backHemY - g.backUnderY)
	return g
}

// konveksiPanel drafts a front or back half: neckline, shoulder, armhole,
// a side seam and a hem, the centre line at x = 0. The side seam drops
// straight, as on Dad's paper, unless flare widens the hem for a hip: then
// it slants out to the hem by flare. The hem lifts by rise at the side and
// curves level into the centre line, leaving the side seam square: a few
// millimetres for a flare, hemRise more for a curved (shirttail) hem. With
// no flare and no lift it runs straight across.
func konveksiPanel(neckDepth, width, underY, hemY float64, tip point, neckW float64, back bool, flare, rise float64) (Piece, float64, float64) {
	centreTop := point{0, round1(neckDepth)}
	neckPoint := point{round1(neckW), 0}
	underarm := point{round1(width), round1(underY)}
	hemSide := point{round1(width + flare), round1(hemY - rise)}
	centreBottom := point{0, round1(hemY)}
	nc1, nc2 := neckControls(centreTop, neckPoint, tip)
	// The shop's armhole hollows deeper at the back than the classic one, as
	// a dropped shoulder needs: set so size M's curves run Dad's 21cm front
	// and 27cm back (22 and 28 on the paper, seam allowances included).
	inset, underIn, scoop := 1.0, 3.25, 0.45
	if back {
		inset, underIn, scoop = 3.0, 2.5, 0.5
	}
	armhole := shapedArmhole(neckPoint, tip, underarm, hemSide, inset, underIn, 0.5, scoop)
	o := outline{start: centreTop}
	o.curveTo(nc1, nc2, neckPoint).lineTo(tip).add(armhole...)
	o.lineTo(hemSide)
	if rise > 0 {
		// Leave the side seam square: inward and a little down along the
		// seam's perpendicular, then run level into the centre line.
		side := unit(sub(hemSide, underarm))
		in := point{-side.y, side.x}
		if in.x > 0 {
			in = scale(in, -1)
		}
		o.curveTo(add(hemSide, scale(in, hemSide.x*0.35)), point{round1(hemSide.x * 0.4), centreBottom.y}, centreBottom)
	} else {
		o.lineTo(centreBottom)
	}
	o.lineTo(centreTop)
	return Piece{
		PathData:    o.path(),
		Width:       round1(max2(width+flare, tip.x)),
		Height:      round1(hemY),
		FoldEdge:    "left",
		ShoulderTip: &Point{X: tip.x, Y: tip.y},
		Landmarks:   panelLandmarks(neckPoint, tip, underarm, hemSide, centreBottom),
		SeamAllow:   kSeamAllow,
		HemAllow:    kHemAllow,
	}, lengthOf(tip, armhole), cubicLength(centreTop, nc1, nc2, neckPoint)
}

// konveksiSleeve drafts the short sleeve: the shop's width and hem, the cap
// made just as low as it can be while still running the armhole plus
// kCapEase. The hem meets the underarm seams square, as in draftSleeve.
// The shop's cap curve, fitted to a top-down photo of Dad's paper sleeve
// (October 2026): it leaves each underarm steeply, after a short start
// square to the side seam, and rounds over a broad dome, where the classic
// cap stays flat near the underarm and peaks like a bell. On size M it
// stands 8.5 finished, about 9 as cut, at the length of Dad's (51 as cut).
const (
	kCapCornerHandle = 0.15 // of the half width: the short squared start at the underarm
	kCapCrownHandle  = 0.60 // of the half width: how broad the dome is at the top
)

// konveksiCapControls are the Bézier controls of the shop cap: crown to back
// underarm (backC1, backC2), then front underarm to crown (frontC1, frontC2).
func konveksiCapControls(halfBicep, capHeight, tilt float64) (backC1, backC2, frontC1, frontC2 point) {
	handle := kCapCornerHandle * halfBicep
	backC1 = point{round1(halfBicep * (1 - kCapCrownHandle)), 0}
	backC2 = point{round1(handle * math.Cos(tilt)), round1(capHeight - handle*math.Sin(tilt))}
	frontC1 = point{round1(2*halfBicep - handle*math.Cos(tilt)), round1(capHeight - handle*math.Sin(tilt))}
	frontC2 = point{round1(halfBicep * (1 + kCapCrownHandle)), 0}
	return
}

func konveksiCapLength(halfBicep, capHeight, tilt float64) float64 {
	b1, b2, f1, f2 := konveksiCapControls(halfBicep, capHeight, tilt)
	return cubicLength(point{halfBicep, 0}, b1, b2, point{0, capHeight}) +
		cubicLength(point{2 * halfBicep, capHeight}, f1, f2, point{halfBicep, 0})
}

func konveksiSleeve(g konveksiGeom, armhole, length float64) Piece {
	halfBicep, halfHem := g.halfBicep, math.Min(g.halfHem, g.halfBicep)
	target := armhole + kCapEase
	tilt, capHeight := 0.0, 0.0
	for i := 0; i < 3; i++ {
		lo, hi := 1.0, armhole*0.5
		for j := 0; j < 50; j++ {
			mid := (lo + hi) / 2
			if konveksiCapLength(halfBicep, mid, tilt) < target {
				lo = mid
			} else {
				hi = mid
			}
		}
		capHeight = (lo + hi) / 2
		length = math.Max(length, capHeight+3)
		tilt = math.Atan2(halfBicep-halfHem, length-capHeight)
	}
	width := 2 * halfBicep
	crown := point{round1(halfBicep), 0}
	backUnderarm := point{0, round1(capHeight)}
	frontUnderarm := point{round1(width), round1(capHeight)}
	// Dad's hem is straight across, the sides tapering in to it. Its
	// allowance is cut the Japanese way (see Finish): the side mirrored below
	// the hem line, so the turned-up hem lies flat at the underarm seam and
	// the cut corners stick out in two points.
	backHem := point{round1(halfBicep - halfHem), round1(length)}
	frontHem := point{round1(halfBicep + halfHem), round1(length)}
	backC1, backC2, frontC1, frontC2 := konveksiCapControls(halfBicep, capHeight, tilt)
	pb := &pathBuilder{}
	pb.moveTo(crown).
		curveTo(backC1, backC2, backUnderarm).
		lineTo(backHem).
		lineTo(frontHem).
		lineTo(frontUnderarm).
		curveTo(frontC1, frontC2, crown).
		close()
	return Piece{
		Name:     "Sleeve",
		PathData: pb.String(),
		Width:    round1(width),
		Height:   round1(length),
		Landmarks: map[string]Point{
			"backUnderarm":  {X: backUnderarm.x, Y: backUnderarm.y},
			"frontUnderarm": {X: frontUnderarm.x, Y: frontUnderarm.y},
			"backWrist":     {X: backHem.x, Y: backHem.y},
			"frontWrist":    {X: frontHem.x, Y: frontHem.y},
		},
		Crown:     &Point{X: crown.x, Y: crown.y},
		SeamAllow: kSeamAllow,
		HemAllow:  kSleeveHemAllow,
		Notes:     fmt.Sprintf("Full piece, cut once per arm (not on fold). The shop's short sleeve: a round cap (%.1fcm) that rises steeply from the underarm, eased into the armhole by only %.1fcm, a wide sleeve and a straight hem.", capHeight, kCapEase),
	}
}

// konveksiCollar is the shop's stand collar, half of it with centre back on
// the fold: 5.1cm high at the back, 4 at the front end, its neck edge
// curving up toward the front so it hugs the neck, and as long as the
// neckline it is sewn to. inner gives its stiff inner layer instead: 3.5cm
// high against the neck seam, stopping 2cm short of the front end.
func konveksiCollar(neckLen float64, inner bool) Piece {
	const rise = 1.5 // how far the neck edge lifts by the front end
	// The neck edge: find the run that makes the curve neckLen long.
	neckEdge := func(run float64) [4]point {
		return [4]point{{0, 0}, {run * 0.45, 0}, {run * 0.8, -rise * 0.35}, {run, -rise}}
	}
	run := neckLen
	for i := 0; i < 20; i++ {
		e := neckEdge(run)
		run *= neckLen / cubicLength(e[0], e[1], e[2], e[3])
	}
	backH, frontH := kCollarBack, kCollarFront
	name := "Standing collar"
	notes := "The shop's stand collar, cut as one whole piece (not on a fold), as on the shop's paper pattern. Cut 2 (outer collar and its lining). 5.1cm high at the back, 4cm at the front ends, which meet at centre front."
	if inner {
		// The same neck curve, stopping short of the front end.
		run -= kInterfacingStop
		backH, frontH = kInterfacing, kInterfacing
		name = "Collar interfacing"
		notes = "Cut 1 whole from kain keras (stiff interfacing), no seam allowance: it stiffens the collar between its seams, 3.5cm high and 2cm short of each front end."
	}
	e := neckEdge(run)
	// Points with the neck edge's back end at (0, backH), y down.
	at := func(p point, dy float64) point { return point{round1(p.x), round1(p.y + backH + dy)} }
	build := func(dy float64) string {
		front := e[3]
		topFront := point{front.x - 0.5, front.y - frontH}
		pb := &pathBuilder{}
		pb.moveTo(at(e[0], dy)).
			curveTo(at(e[1], dy), at(e[2], dy), at(front, dy)).
			// the front end, rounded off toward the top edge
			curveTo(at(point{front.x + 0.3, front.y - frontH*0.45}, dy), at(point{topFront.x + 0.5, topFront.y + 0.3}, dy), at(topFront, dy)).
			curveTo(at(point{topFront.x * 0.7, topFront.y + (frontH-backH)*0.2}, dy), at(point{topFront.x * 0.3, -backH}, dy), at(point{0, -backH}, dy)).
			close()
		return pb.String()
	}
	poly := flattenPath(build(0))
	minY, maxY, maxX := poly[0].y, poly[0].y, 0.0
	for _, q := range poly {
		minY, maxY, maxX = math.Min(minY, q.y), math.Max(maxY, q.y), math.Max(maxX, q.x)
	}
	p := Piece{
		Name:     name,
		PathData: build(-minY), // the piece's own top at y = 0, as every piece is drawn
		Width:    round1(maxX),
		Height:   round1(maxY - minY),
		FoldEdge: "left",
		CutFull:  true,
		Notes:    notes,
	}
	if inner {
		p.NoAllowance = true
	} else {
		p.SeamAllow = kSeamAllow
	}
	return p
}

// draftKonveksiShirt drafts the whole shirt in the shop's block for one size:
// the same set of pieces DraftShirt hands out (front, back, sleeve, collar,
// the front's lidah, and the extras), so the preview, the pattern sheet and
// the cutting layout treat it like any other shirt.
func draftKonveksiShirt(sp konveksiSpec, m Measurements, opts ShirtOptions) []Piece {
	g := konveksiGeometry(sp)
	// A size whose hip is wider than the chart's hem gets its side seams
	// flared out from the underarm until the hem goes over the hip with 2cm
	// to spare, the extra shared evenly by front and back so the side seams
	// stay the same length. Every other size keeps Dad's straight sides.
	flare, rise := 0.0, 0.0
	if m.Hip > 0 {
		if need := (m.Hip+2)/2 - (g.front + g.backHalf); need > 0.05 {
			flare = math.Min(need/2, 12)
			side := g.backHemY - g.backUnderY
			// How far the hem lifts at the side to meet the slanted seam square:
			// half the seam's slope across the average half width.
			rise = 0.5 * flare / side * ((g.front+g.backHalf)/2 + flare)
		}
	}
	if opts.HemStyle != "straight" && opts.HemStyle != "" {
		rise += hemRise // a curved (shirttail) hem
	}
	front, frontArm, frontNeck := konveksiPanel(g.frontNeck, g.front, g.frontUnderY, g.frontHemY, g.frontTip, g.neckW, false, flare, rise)
	back, backArm, backNeck := konveksiPanel(g.backNeck, g.backHalf, g.backUnderY, g.backHemY, g.backTip, g.neckW, true, flare, rise)
	if flare > 0 {
		front.Notes += fmt.Sprintf(" The side seam flares %.1fcm out to the hem so it goes over a %.0fcm hip.", flare, m.Hip)
	}
	front.Name, back.Name = "Shirt front", "Shirt back"
	front.Notes = "Half front, center front (left edge) on fold. The shop's uniform block: straight side seam, flat shoulder set forward."
	back.Notes = "Full back, cut as one whole piece (not on a fold), as on the shop's paper pattern: no yoke, no centre seam. The shop's uniform block."
	back.CutFull = true
	if sp.clamped {
		front.Notes += " This size is beyond the shop chart (3XS-7XL): drafted as the nearest end of it."
	}
	vNeck := !opts.Collar && opts.Neckline == "v_neck"
	vDepth := round1(g.frontUnderY * vNeckDepthFactor)
	if vNeck {
		front = vNeckFront(front, vDepth)
	}

	// The shop's sleeve is short. A long or 3/4 sleeve on this block is the
	// classic sleeve fitted to this armhole, with its cuff and placket.
	var sleeve Piece
	var sleeveExtras []Piece
	if opts.SleeveStyle == "half" || opts.SleeveStyle == "" {
		sleeve = konveksiSleeve(g, frontArm+backArm, sp.sleeveLen)
	} else {
		mm := m.withDefaults()
		sleeveLen := mm.SleeveLength - cuffDepth/sleeveLengthFraction(opts.SleeveStyle)
		// draftSleeve cuts a uniform sleeve the shoulder width less 2 wide: give
		// it the width that comes out at Dad's (L is one step above M).
		across := kLongSleeveL + kSleeveWidthStep*(sp.step-1) + 2
		sleeve = draftSleeve(frontArm+backArm, sleeveLen, mm.UpperArm, mm.Wrist, kBodyEase, across, opts.SleeveStyle, "Sleeve")
		sleeve.SeamAllow, sleeve.HemAllow = kSeamAllow, kSeamAllow // sewn to the cuff
		cuff := draftCuff(mm.Wrist)
		cuff.SeamAllow = kSeamAllow
		sleeveExtras = append(sleeveExtras, cuff)
		if opts.SleevePlacket == "bound" {
			sleeveExtras = append(sleeveExtras, draftCuffSlit(mm.SleeveLength))
		} else {
			tower, underlap := draftCuffTower(mm.SleeveLength)
			sleeveExtras = append(sleeveExtras, tower, underlap)
		}
	}
	if opts.SleeveFabric == "contrast" {
		sleeve.Fabric = "contrast"
		for i := range sleeveExtras {
			sleeveExtras[i].Fabric = "contrast"
		}
	}
	pieces := append([]Piece{front, back, sleeve}, sleeveExtras...)

	if opts.Collar {
		neckLen := frontNeck + backNeck
		switch opts.CollarStyle {
		case "standing", "", "polo":
			pieces = append(pieces, konveksiCollar(neckLen, false), konveksiCollar(neckLen, true))
		case "spread":
			pieces = append(pieces, draftCollarStand(neckLen), draftSpreadCollarLeaf(neckLen))
		case "peter_pan":
			pieces = append(pieces, draftCollarStand(neckLen), draftPeterPanCollarLeaf(neckLen))
		default:
			pieces = append(pieces, draftCollarStand(neckLen), draftCollarLeaf(neckLen))
		}
		if opts.Trim == "contrast" {
			pieces = append(pieces, neckTrimPieces(false, "contrast", g.neckW, vDepth, neckLen*1.1+16)...)
		}
	}
	if vNeck {
		pieces = append(pieces, neckTrimPieces(true, opts.Trim, g.neckW, vDepth, 0)...)
	}

	// The opening: a left and a right front, each 2.5cm past centre front and
	// folded back 2.5cm as its own facing, and the lidah over the buttons.
	opens := opts.Collar && opts.FrontStyle != "plain" && opts.FrontStyle != "half_placket"
	if opens {
		f := &pieces[0]
		if o, ok := parseOutline(f.PathData); ok {
			if wider, edge, ok := o.extendLeft(kOverlap + kFacing); ok {
				f.Outline = f.PathData
				f.PathData = wider.path()
				f.FoldEdge = ""
				f.Qty = 2
				f.Landmarks["foldLine"] = Point{X: -kOverlap}
				f.Notes = fmt.Sprintf("Front, cut 2 (left and right, mirror images). The shop's uniform block: straight side seam, flat shoulder set forward. The front edge is %.1fcm past centre front and folds back %.1fcm along the marked line as its own facing; buttons and buttonholes on centre front.", kOverlap+kFacing, kFacing)
				lidah := draftPlacket(round1(edge))
				lidah.Name = "Hidden placket"
				lidah.Width = kLidah
				lidah.PathData = (&pathBuilder{}).moveTo(point{0, 0}).lineTo(point{kLidah, 0}).lineTo(point{kLidah, round1(edge)}).lineTo(point{0, round1(edge)}).close().String()
				lidah.Qty = 2 // one strip, cut on the fold
				lidah.SeamAllow = kSeamAllow
				lidah.Notes = fmt.Sprintf("The lidah: one strip on the fold, %.1fcm wide finished, sewn along the left front so it covers the buttons.", kLidah)
				pieces = append(pieces, lidah)
			}
		}
	}

	if opts.Panel == "side" {
		if inner, panel, outer := insertPanelPieces(pieces[0]); panel != nil {
			pieces[0].Qty = 1
			panel.Motif = opts.motifPattern("side")
			panel.Notes = "Cut 1 in the " + motifMaterial(panel.Motif) + ". It sits between the two front pieces of that side, shoulder to hem."
			for _, pc := range []*Piece{inner, panel, outer} {
				if pc != nil {
					pc.SeamAllow, pc.HemAllow = kSeamAllow, kHemAllow
					pieces = append(pieces, withQty(*pc, 1, ""))
				}
			}
		}
	}
	if (opts.ColorBlock == "straight" || opts.ColorBlock == "v") && opts.Panel != "side" {
		pieces = colorBlock(pieces, back, opts.ColorBlock)
	}
	pieces = append(pieces, motifPieces(pieces[0], back, sleeve, opts.Motifs, opts.motifPattern)...)
	pieces = append(pieces, draftAccessoryPockets(opts.AddOns.Accessories, &pieces[0], &pieces[1], &sleeve)...)
	return pieces
}
