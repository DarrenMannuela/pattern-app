package draft

import (
	"math"
)

// Merchandise drafting: bags, headwear and flat items built from basic
// shapes (rectangles, rounded rectangles, circles, rings) with add-ons.
// Each item is a short list of pieces with their cut counts; the 2D preview
// (frontend/src/lib/merchFlat.js) draws the assembled item from the same
// pieces. Dimensions are cm.

// MerchOptions picks the item and its parts. Zero values are each item's
// default.
type MerchOptions struct {
	// Item: tote_bag, drawstring_bag, pouch, apron, bucket_hat, headband,
	// patch, lanyard or banner.
	Item string `json:"item"`
	// Size scales the item's default dimensions: "small" (0.8), "medium"
	// (default) or "large" (1.25). Width and Height (cm) override them.
	Size   string  `json:"size"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	// Shape is the outline: bag bodies "square"/"rounded"; patches "rect",
	// "rounded", "circle" or "shield"; banners "rect" or "pennant"; an
	// apron "full" or "bib".
	Shape string `json:"shape"`
	// Strap: tote handles "long", "short" or "none"; drawstring bag cord
	// "cord" or "none".
	Strap string `json:"strap"`
	// Pocket: "none" (default) or "patch" on a tote, drawstring bag or apron.
	Pocket string `json:"pocket"`
	// Bottom: tote "flat" (default) or "gusset".
	Bottom string `json:"bottom"`
	// Brim: bucket hat "short" (default), "wide" or "none".
	Brim string `json:"brim"`
	// Closure: pouch "zip" (default) or "flap".
	Closure string `json:"closure"`
}

type merchDefaults struct{ w, h float64 }

var merchItems = map[string]merchDefaults{
	"tote_bag":       {36, 40},
	"drawstring_bag": {30, 38},
	"pouch":          {20, 12},
	"apron":          {70, 50}, // waist apron body; a bib adds ~36cm (86cm long overall, the standard full-length bib apron)
	"bucket_hat":     {56, 9},  // head circumference, crown side height (adult 56-58 / 8-10)
	"headband":       {54, 8},
	"patch":          {8, 8},
	"lanyard":        {90, 2.5},
	"banner":         {60, 90},
}

// MerchItems lists the item ids the drafter knows.
func MerchItems() []string {
	return []string{"tote_bag", "drawstring_bag", "pouch", "apron", "bucket_hat", "headband", "patch", "lanyard", "banner"}
}

func sizeScale(size string) float64 {
	switch size {
	case "small":
		return 0.8
	case "large":
		return 1.25
	}
	return 1
}

func withQty(p Piece, qty int, notes string) Piece {
	p.Qty = qty
	if notes != "" {
		p.Notes = notes
	}
	return p
}

// circlePiece is a full circle of radius r.
func circlePiece(name string, r float64) Piece {
	k := r * 0.5523
	pb := &pathBuilder{}
	pb.moveTo(point{round1(r), 0}).
		curveTo(point{round1(r + k), 0}, point{round1(2 * r), round1(r - k)}, point{round1(2 * r), round1(r)}).
		curveTo(point{round1(2 * r), round1(r + k)}, point{round1(r + k), round1(2 * r)}, point{round1(r), round1(2 * r)}).
		curveTo(point{round1(r - k), round1(2 * r)}, point{0, round1(r + k)}, point{0, round1(r)}).
		curveTo(point{0, round1(r - k)}, point{round1(r - k), 0}, point{round1(r), 0}).
		close()
	return Piece{Name: name, PathData: pb.String(), Width: round1(2 * r), Height: round1(2 * r)}
}

// halfRing is half of a flat ring (inner radius rIn, outer rOut): the
// arc from left to right along the top, so the piece is 2*rOut wide.
func halfRing(name string, rIn, rOut float64) Piece {
	const steps = 24
	pb := &pathBuilder{}
	cx, cy := rOut, rOut
	for i := 0; i <= steps; i++ {
		a := math.Pi + math.Pi*float64(i)/steps
		p := point{round1(cx + rOut*math.Cos(a)), round1(cy + rOut*math.Sin(a))}
		if i == 0 {
			pb.moveTo(p)
		} else {
			pb.lineTo(p)
		}
	}
	for i := steps; i >= 0; i-- {
		a := math.Pi + math.Pi*float64(i)/steps
		pb.lineTo(point{round1(cx + rIn*math.Cos(a)), round1(cy + rIn*math.Sin(a))})
	}
	pb.close()
	p := Piece{Name: name, PathData: pb.String(), Width: round1(2 * rOut), Height: round1(rOut)}
	p.Landmarks = map[string]Point{"inner": {X: round1(rIn), Y: 0}}
	return p
}

// polygon builds a closed straight-sided piece from its points.
func polygonPiece(name string, pts []point) Piece {
	pb := &pathBuilder{}
	maxX, maxY := 0.0, 0.0
	for i, p := range pts {
		if i == 0 {
			pb.moveTo(p)
		} else {
			pb.lineTo(p)
		}
		maxX, maxY = math.Max(maxX, p.x), math.Max(maxY, p.y)
	}
	pb.close()
	return Piece{Name: name, PathData: pb.String(), Width: round1(maxX), Height: round1(maxY)}
}

func shieldPiece(name string, w, h float64) Piece {
	pb := &pathBuilder{}
	pb.moveTo(point{0, 0}).
		lineTo(point{round1(w), 0}).
		lineTo(point{round1(w), round1(h * 0.55)}).
		curveTo(point{round1(w), round1(h * 0.85)}, point{round1(w * 0.65), round1(h * 0.95)}, point{round1(w / 2), round1(h)}).
		curveTo(point{round1(w * 0.35), round1(h * 0.95)}, point{0, round1(h * 0.85)}, point{0, round1(h * 0.55)}).
		close()
	return Piece{Name: name, PathData: pb.String(), Width: round1(w), Height: round1(h)}
}

// roundedPiece is a rectangle with the given corner radius on all corners.
func roundedPiece(name string, w, h, r float64) Piece {
	r = math.Min(r, math.Min(w, h)/2)
	k := r * 0.5523
	pb := &pathBuilder{}
	pb.moveTo(point{round1(r), 0}).
		lineTo(point{round1(w - r), 0}).
		curveTo(point{round1(w - r + k), 0}, point{round1(w), round1(r - k)}, point{round1(w), round1(r)}).
		lineTo(point{round1(w), round1(h - r)}).
		curveTo(point{round1(w), round1(h - r + k)}, point{round1(w - r + k), round1(h)}, point{round1(w - r), round1(h)}).
		lineTo(point{round1(r), round1(h)}).
		curveTo(point{round1(r - k), round1(h)}, point{0, round1(h - r + k)}, point{0, round1(h - r)}).
		lineTo(point{0, round1(r)}).
		curveTo(point{0, round1(r - k)}, point{round1(r - k), 0}, point{round1(r), 0}).
		close()
	return Piece{Name: name, PathData: pb.String(), Width: round1(w), Height: round1(h)}
}

// DraftMerch returns the cut set for a merchandise item.
func DraftMerch(o MerchOptions) []Piece {
	def, ok := merchItems[o.Item]
	if !ok {
		return nil
	}
	k := sizeScale(o.Size)
	w, h := def.w*k, def.h*k
	if o.Item == "bucket_hat" || o.Item == "headband" {
		// A head is a head: size scales the fit a little, not the fabric.
		w, h = def.w*(0.9+0.1*k), def.h
	}
	if o.Width > 0 {
		w = o.Width
	}
	if o.Height > 0 {
		h = o.Height
	}
	var ps []Piece
	pocket := func(pw, ph float64) {
		if o.Pocket == "patch" {
			ps = append(ps, withQty(draftPatchPocket(pw, ph, 0, 0, "Pocket", "classic"), 1, "Cut 1. Hem the top edge, press the other sides under and topstitch to the front panel."))
		}
	}

	switch o.Item {
	case "tote_bag":
		body := func() Piece {
			if o.Shape == "rounded" {
				return draftPatchPocket(w, h, 0, 0, "Body panel", "rounded")
			}
			return draftPatchPocket(w, h, 0, 0, "Body panel", "square")
		}()
		ps = append(ps, withQty(body, 2, "Cut 2 (front and back). Sew the sides and base, hem the top 3cm."))
		if o.Bottom == "gusset" {
			ps = append(ps, withQty(draftRectPiece("Base gusset", w, 10, "", ""), 1, "Cut 1. Sewn between the two panels along the base for a flat bottom."))
		}
		switch o.Strap {
		case "none":
		case "short":
			ps = append(ps, withQty(draftRectPiece("Handle", 38, 7, "", ""), 2, "Cut 2. Fold in thirds, topstitch both edges, attach 8cm apart to each panel."))
		default:
			ps = append(ps, withQty(draftRectPiece("Handle", 65, 7, "", ""), 2, "Cut 2. Fold in thirds, topstitch both edges, attach 8cm apart to each panel."))
		}
		pocket(math.Min(w*0.4, 16), math.Min(h*0.4, 18))
	case "drawstring_bag":
		ps = append(ps, withQty(draftPatchPocket(w, h+4, 0, 0, "Body panel", "square"), 2, "Cut 2. The top 4cm folds down to form the drawstring channel."))
		if o.Strap != "none" {
			ps = append(ps, withQty(draftRectPiece("Drawstring cord", w*2+30, 1.5, "", ""), 1, "Cut 1 (or use ready cord), threaded through the channel."))
		}
		pocket(math.Min(w*0.4, 14), math.Min(h*0.3, 14))
	case "pouch":
		ps = append(ps, withQty(roundedPiece("Body panel", w, h, 2.5), 2, "Cut 2 (outer) and 2 lining."))
		if o.Closure == "flap" {
			ps = append(ps, withQty(roundedPiece("Flap", w, 8, 2.5), 1, "Cut 2, sewn right sides together and turned."))
		} else {
			ps = append(ps, withQty(draftRectPiece("Zip tab", 4, 3, "", ""), 2, "Cut 2 to cover the zip ends."))
		}
	case "apron":
		ps = append(ps, withQty(draftRectPiece("Apron body", w, h, "", ""), 1, "Cut 1. Hem the sides and bottom 1.5cm; the top joins the bib or waistband."))
		if o.Shape == "bib" {
			// A bib is about half the apron's width and ~36cm tall, narrowing
			// toward the neck (standard full-length bib apron: 86cm overall).
			bibW, bibH := w*0.5, 36*k
			ps = append(ps, withQty(polygonPiece("Bib", []point{{round1(bibW * 0.2), 0}, {round1(bibW * 0.8), 0}, {round1(bibW), round1(bibH)}, {0, round1(bibH)}}), 1, "Cut 1 (and 1 lining)."))
			ps = append(ps, withQty(draftRectPiece("Neck strap", 60, 4, "", ""), 1, "Cut 1 (adjustable, 56-61cm). Folded and topstitched, attached to the bib corners."))
		}
		ps = append(ps, withQty(draftRectPiece("Waist tie", 85, 6, "", ""), 2, "Cut 2. Folded and topstitched, one each side."))
		pocket(math.Min(w*0.35, 22), math.Min(h*0.28, 20))
	case "bucket_hat":
		r := w / (2 * math.Pi)
		ps = append(ps, withQty(circlePiece("Crown top", r), 2, "Cut 2 (outer and lining)."))
		ps = append(ps, withQty(draftRectPiece("Side band", w+2, h, "", ""), 2, "Cut 2 (outer and lining). Join the short ends into a loop."))
		if o.Brim != "none" {
			bw := 5.0
			if o.Brim == "wide" {
				bw = 8.0
			}
			ps = append(ps, withQty(halfRing("Brim half", r, r+bw), 4, "Cut 4 (two halves top, two halves under). Join into a ring, stitch together and turn."))
		}
	case "headband":
		ps = append(ps, withQty(draftRectPiece("Band", w, h, "", ""), 2, "Cut 2. Sew into a tube, join the ends into a ring."))
	case "patch":
		switch o.Shape {
		case "circle":
			ps = append(ps, withQty(circlePiece("Patch", w/2), 1, "Cut 1 with backing."))
		case "shield":
			ps = append(ps, withQty(shieldPiece("Patch", w, h), 1, "Cut 1 with backing."))
		case "rounded":
			ps = append(ps, withQty(roundedPiece("Patch", w, h, math.Min(w, h)*0.25), 1, "Cut 1 with backing."))
		default:
			ps = append(ps, withQty(draftRectPiece("Patch", w, h, "", ""), 1, "Cut 1 with backing."))
		}
	case "lanyard":
		ps = append(ps, withQty(draftRectPiece("Strap", w, h*2, "", ""), 1, "Cut 1. Folded lengthwise, ends joined with the clip."))
	case "banner":
		if o.Shape == "pennant" {
			ps = append(ps, withQty(polygonPiece("Banner", []point{{0, 0}, {round1(w), round1(h / 2)}, {0, round1(h)}}), 2, "Cut 2 (front and back)."))
		} else {
			ps = append(ps, withQty(draftRectPiece("Banner", w, h, "", ""), 2, "Cut 2 (front and back). Fold a 4cm pole channel at the top."))
		}
	}
	return ps
}
