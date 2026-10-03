package draft

import "fmt"

// Construction details that turn a bare torso/leg block into the
// garment a reference chart actually shows: cuffs and cuff slits on a
// dress shirt, the polo's knit collar/placket/ribbing, and the
// trousers' loops and pockets. Each is a small, mostly rectangular
// strip — the point is that they exist as real cut pieces with a cut
// count in their notes, so the pattern sheet lists everything the
// preview shows.
//
// Piece names deliberately avoid "front", "back", "sleeve" and
// "placket": the preview finds the main panels by matching those words
// in a piece's name, and a detail named "Sleeve placket" would be
// picked up as the sleeve (or as the shirt's button placket).

// draftRectPiece is a plain rectangle, width x height cm.
func draftRectPiece(name string, w, h float64, foldEdge, notes string) Piece {
	pb := &pathBuilder{}
	pb.moveTo(point{0, 0}).
		lineTo(point{round1(w), 0}).
		lineTo(point{round1(w), round1(h)}).
		lineTo(point{0, round1(h)}).
		close()
	return Piece{Name: name, PathData: pb.String(), Width: round1(w), Height: round1(h), FoldEdge: foldEdge, Notes: notes}
}

// cuffLength is a buttoned cuff's length: the wrist plus 3cm, as the
// boys' chart draws it (a 17cm cuff for a ~14cm wrist), which covers the
// button overlap and a little ease.
func cuffLength(wrist float64) float64 { return wrist + 3 }

// cuffDepth is the finished cuff's depth, the usual 6cm of a shirt cuff.
const cuffDepth = 6.0

// draftCuff is the buttoned cuff band, drawn at its finished depth against
// the fold it is cut on: one piece folded lengthwise makes the outside and
// the inside of the cuff.
func draftCuff(wrist float64) Piece {
	return draftRectPiece("Cuff", cuffLength(wrist), cuffDepth, "bottom",
		"Cut 2 (one per sleeve) on the fold, plus 2 interfacing. Folded lengthwise to a 6cm finished band; buttonhole at the overlap end, button near the other.")
}

// draftCuffSlit is the facing that finishes the opening above the cuff
// (the chart's small 13 x 2 strip).
func draftCuffSlit(sleeveLen float64) Piece {
	return draftRectPiece("Cuff slit facing", 2, cuffOpening(sleeveLen), "",
		"Cut 2. Folded strip that binds the slit above the cuff so the sleeve can open to slide the hand through.")
}

// cuffOpening is how long the opening above a cuff is: about 28% of the
// sleeve, 9-14cm.
func cuffOpening(sleeveLen float64) float64 { return clamp(sleeveLen*0.28, 9, 14) }

// towerWidth is a tower sleeve placket's finished width.
const towerWidth = 2.5

// draftCuffTower is the tower (pointed) sleeve placket that finishes the
// opening above a cuff, as konveksi kemeja are made: the tower band, whose
// outer half shows on the sleeve and ends in a point, its inner half facing
// it, and a narrow underlap binding for the other edge of the opening. The
// shop's own shirts use it.
func draftCuffTower(sleeveLen float64) (tower, underlap Piece) {
	open := cuffOpening(sleeveLen)
	tip := 2.0
	w := towerWidth
	pb := &pathBuilder{}
	pb.moveTo(point{0, round1(tip)}).
		lineTo(point{round1(w / 2), 0}).
		lineTo(point{round1(w), round1(tip)}).
		lineTo(point{round1(2 * w), round1(tip)}).
		lineTo(point{round1(2 * w), round1(open + tip)}).
		lineTo(point{0, round1(open + tip)}).
		close()
	tower = Piece{
		Name:     "Cuff slit tower",
		PathData: pb.String(),
		Width:    round1(2 * w),
		Height:   round1(open + tip),
		Notes:    fmt.Sprintf("Cut 2 (one per sleeve). Tower placket: the pointed half (left) shows on the outside of the sleeve, %.1fcm wide; the other half folds behind it. Sew it to the overlap edge of the %.0fcm opening.", w, open),
	}
	underlap = draftRectPiece("Cuff slit underlap", 1.2, open, "left",
		fmt.Sprintf("Cut 2 (one per sleeve) on the fold. Binds the underlap edge of the %.0fcm opening, 1.2cm finished.", open))
	return tower, underlap
}

// draftPoloCollar is a flat knit polo collar: a folded strip about as
// long as the neck opening (the 5XL chart cuts 63cm on the fold for a
// full neck) and 7-8cm deep, cut on the fold with the ends left square
// to overlap at the placket.
func draftPoloCollar(neckLen float64) Piece {
	return draftRectPiece("Polo collar", neckLen*2+1.5, 8, "bottom",
		"Cut 2 in knit (self or rib), on the fold. Sew to the neckline with the ends meeting at the placket; edges are left raw or turned in.")
}

// draftPoloPlacket is the short button placket (chart: 6.5 x 17).
func draftPoloPlacket(frontNeck float64) Piece {
	return draftRectPiece("Polo placket", 6.5, clamp(frontNeck+9, 14, 18), "left",
		"Cut 2 on the fold. Two buttons, spaced about 6cm apart down the placket.")
}

// draftSleeveRib is the ribbed band on a short polo sleeve.
func draftSleeveRib(sleeveWidth float64) Piece {
	return draftRectPiece("Sleeve rib", sleeveWidth*0.9, 6, "bottom",
		"Cut 2 in rib knit, on the fold, stretched to fit the sleeve opening.")
}

// Trouser details.

func draftBeltLoop() Piece {
	return withQty(draftRectPiece("Belt loop", 3.2, 9, "", ""), 7,
		"Cut 7 (two at the front, two at the side seams, two at the back and one at center back), each 1.3cm wide when finished. Fold the edges to the middle, stitch, then attach top and bottom across the waistband.")
}

func draftSlantPocketBag(qHip float64) Piece {
	w, h := qHip*0.62, 22.0
	pb := &pathBuilder{}
	pb.moveTo(point{0, 0}).
		lineTo(point{round1(w), 0}).
		lineTo(point{round1(w), round1(h - 6)}).
		curveTo(point{round1(w), round1(h - 1)}, point{round1(w * 0.6), round1(h)}, point{round1(w * 0.3), round1(h)}).
		lineTo(point{0, round1(h)}).
		close()
	return Piece{Name: "Slant pocket bag", PathData: pb.String(), Width: round1(w), Height: round1(h),
		Notes: "Cut 4 (pocket bag plus facing, both sides). Opening slants from the waistline, about 6.5cm in from the side seam, down to the side seam about 16cm below."}
}

func draftWeltStrip() Piece {
	return draftRectPiece("Welt strip", 14, 2.5, "",
		"Cut 2. Double-welt back pocket with a button and buttonhole, opening about 13cm wide and 1.6cm deep when finished.")
}

func draftWeltPocketBag() Piece {
	return draftRectPiece("Welt pocket bag", 15, 17, "",
		"Cut 2. Bag for the back welt pocket, sewn behind the welt opening.")
}

func draftFlyFacing(rise float64) Piece {
	return draftRectPiece("Fly facing", 4, rise*0.5, "",
		"Cut 1. Faces the zip opening at center front, with the J-stitch line drawn on the front panel.")
}
