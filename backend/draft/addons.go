// Add-ons layered onto a base garment — patch pockets, embroidery,
// sablon (screen print) — attached to a specific named segment of the
// garment (left chest, back, a sleeve, ...) so a customer can mix
// several on the same garment, and even stack more than one on the
// same segment (a chest pocket with a sablon logo printed on it).
package draft

import (
	"fmt"
	"math"
	"strings"
)

// Garment segments an accessory can attach to. Not every garment kind
// has every segment (pants/skirts don't have a collar or sleeves) —
// each drafting function only looks at the segments it actually has a
// piece for for pockets, and effectively ignores the rest (they still
// round-trip through the mockup record for embroidery/sablon, which
// don't need a real piece to attach to).
const (
	SegmentCollar      = "collar"
	SegmentLeftChest   = "left_chest"
	SegmentRightChest  = "right_chest"
	SegmentCenterFront = "center_front"
	SegmentBack        = "back"
	SegmentLeftSleeve  = "left_sleeve"
	SegmentRightSleeve = "right_sleeve"
	SegmentCuffs       = "cuffs"

	// Trouser, shorts and skirt segments. left_/right_ are the wearer's left
	// and right, like the shirt's; "hem" is the band along the bottom edge.
	SegmentWaistband = "waistband"
	SegmentLeftLeg   = "left_leg"
	SegmentRightLeg  = "right_leg"
	SegmentLeftHem   = "left_hem"
	SegmentRightHem  = "right_hem"
	SegmentHem       = "hem"
)

// Accessory is one pocket, embroidery patch, or sablon (screen print)
// attached to a specific segment. ID is assigned client-side (the
// design preview needs a stable handle for one instance among
// possibly several on the same segment, for dragging/removing it
// individually) and round-trips through unchanged.
type Accessory struct {
	ID      string `json:"id"`
	Type    string `json:"type"` // "pocket" | "embroidery" | "sablon"
	Segment string `json:"segment"`
	// Position overrides the segment's default spot — a fraction
	// (0-1) of that segment's own parent piece's width/height (for
	// pocket) or of the design preview's own layout (for
	// embroidery/sablon, which have no real piece of their own). Nil
	// means "use the default position for this segment+type".
	Position *Position `json:"position,omitempty"`
	Width    float64   `json:"width,omitempty"`
	Height   float64   `json:"height,omitempty"`
	Label    string    `json:"label,omitempty"`
	// Shape is a pocket's outline: "classic" (default, gently rounded
	// bottom corners), "square", "rounded" or "pointed". Width and
	// Height (cm) size a pocket when set, else it is sized from the
	// piece it sits on.
	Shape string `json:"shape,omitempty"`
	// Rotation turns the accessory, in degrees clockwise as drawn in the
	// preview (0 = upright). A pen pocket on a sleeve is turned to follow the
	// arm; the cut piece is the same, only its sewing position changes.
	Rotation float64 `json:"rotation,omitempty"`
	// View is the drawing the extra was placed on: "front", "back", or for a
	// sleeve "left" / "right" (the outside of that sleeve). It decides which
	// face of a sleeve a pocket sits on.
	View string `json:"view,omitempty"`
	// Fabric is "" (cut from the garment's main fabric, the default) or
	// "contrast" — a pocket cut from the same second fabric as a motif band
	// or insert panel (a batik-fabric pocket on a plain shirt is common
	// konveksi work). Only meaningful for a pocket; embroidery and sablon
	// are printed onto whatever fabric is already there.
	Fabric string `json:"fabric,omitempty"`
}

// Position is a fraction (0-1) of a parent piece's own width/height —
// resolution-independent so it means the same thing regardless of
// that piece's actual size for this order/size.
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// AddOns are the accessories a customer might ask for on top of the
// base garment.
type AddOns struct {
	Accessories []Accessory `json:"accessories,omitempty"`
}

// defaultPocketAnchor returns the standard (segment-relative) anchor
// fraction for a patch pocket on the given segment, used whenever an
// accessory doesn't carry an explicit Position override.
func defaultPocketAnchor(segment string) (x, y float64) {
	switch segment {
	case SegmentLeftChest:
		return 0.42, 0.24
	case SegmentRightChest:
		return 0.58, 0.24
	case SegmentCenterFront:
		return 0.5, 0.3
	case SegmentBack:
		return 0.55, 0.15
	case SegmentLeftSleeve, SegmentRightSleeve:
		return 0.5, 0.3
	default:
		return 0.5, 0.25
	}
}

func pocketAnchorFraction(acc Accessory) (x, y float64) {
	if acc.Position != nil {
		// The preview stores an x on the side the extra was put (negative left
		// of center); the anchor is a distance from the center line.
		return math.Abs(acc.Position.X), acc.Position.Y
	}
	return defaultPocketAnchor(acc.Segment)
}

// pocketName gives each pocket a distinct, self-documenting name —
// needed now that a garment can carry more than one (both chest
// pockets, say), and encodes the segment so the design preview can
// tell which one is which without a separate lookup, and the cutting
// floor can tell them apart on the layout sheet.
func pocketName(segment string) string {
	switch segment {
	case SegmentLeftChest:
		return "Pocket — left chest"
	case SegmentRightChest:
		return "Pocket — right chest"
	case SegmentCenterFront:
		return "Pocket — center front"
	case SegmentBack:
		return "Pocket — back"
	case SegmentLeftSleeve:
		return "Pocket — left sleeve"
	case SegmentRightSleeve:
		return "Pocket — right sleeve"
	case SegmentLeftLeg:
		return "Pocket — left leg"
	case SegmentRightLeg:
		return "Pocket — right leg"
	default:
		return "Pocket"
	}
}

// isPenPocket is a slim pocket meant for a pen (or two): narrow and much
// taller than it is wide.
func isPenPocket(width, height float64) bool {
	return width > 0 && width <= 5.5 && height >= 2*width
}

// draftAccessoryPockets drafts one real patch-pocket piece for every
// "pocket"-type accessory whose segment has a real parent piece to
// attach to. front/back/sleeve may be nil (a garment kind that
// doesn't have that piece, e.g. no sleeve on a skirt) — accessories
// targeting a segment with no matching piece are silently skipped
// rather than erroring, since the UI only offers segments the current
// garment actually has.
func draftAccessoryPockets(accessories []Accessory, front, back, sleeve *Piece) []Piece {
	var pieces []Piece
	for _, acc := range accessories {
		if acc.Type != "pocket" {
			continue
		}
		posX, posY := pocketAnchorFraction(acc)
		var parent *Piece
		switch acc.Segment {
		case SegmentLeftChest, SegmentRightChest, SegmentCenterFront, SegmentLeftLeg, SegmentRightLeg:
			parent = front
		case SegmentBack:
			parent = back
		case SegmentLeftSleeve, SegmentRightSleeve:
			parent = sleeve
		}
		if parent == nil {
			continue
		}
		anchorX := parent.Width * posX
		anchorY := parent.Height * posY
		size := parent.Width * 0.32
		width, height := size, size*1.05
		if acc.Width > 0 {
			width = acc.Width
		}
		if acc.Height > 0 {
			height = acc.Height
		}
		name := pocketName(acc.Segment)
		if isPenPocket(width, height) {
			name = "Pen " + strings.ToLower(name[:1]) + name[1:]
		}
		pocket := draftPatchPocket(width, height, anchorX, anchorY, name, acc.Shape)
		pocket.Segment = acc.Segment
		if acc.Fabric == "contrast" {
			pocket.Fabric = "contrast"
			pocket.Notes += " Cut in the contrast (batik or printed) fabric, to match the garment's trim."
		}
		if face := sleeveFace(acc); face != "" {
			pocket.Notes += " Sew it on the " + face + " of the sleeve."
		}
		if deg := normalizeDegrees(acc.Rotation); deg != 0 {
			pocket.Notes += fmt.Sprintf(" Sew it turned %.0f° %s from upright, as drawn in the preview.", math.Abs(deg), turnDirection(deg))
		}
		pieces = append(pieces, pocket)
	}
	return pieces
}

// draftPatchPocket drafts a simple rectangular patch pocket with
// gently rounded bottom corners — cut separately and topstitched onto
// the garment, the most common pocket on konveksi uniform work (welt
// and besom pockets need a slash in the main piece itself, a
// different and more involved construction). anchorX/anchorY report
// where its top-center should sit on the parent piece it's meant for,
// in that piece's own local coordinates, so a caller can position it
// without guessing.
func draftPatchPocket(width, height, anchorX, anchorY float64, name, shape string) Piece {
	if width == 0 {
		width = 12
	}
	if height == 0 {
		height = 13
	}
	// Bottom corner rounding: gentle by default, none for a square
	// pocket, a lot for a rounded one.
	r := math.Min(width, height) * 0.18
	switch shape {
	case "square":
		r = 0
	case "rounded":
		r = math.Min(width, height) * 0.4
	}
	k := r * 0.552 // cubic-bezier circular-arc approximation constant

	topLeft := point{0, 0}
	topRight := point{round1(width), 0}
	pb := &pathBuilder{}
	switch {
	case shape == "pointed":
		// A pentagon: straight sides, the bottom coming to a point.
		side := round1(height * 0.72)
		pb.moveTo(topLeft).
			lineTo(topRight).
			lineTo(point{round1(width), side}).
			lineTo(point{round1(width / 2), round1(height)}).
			lineTo(point{0, side}).
			lineTo(topLeft).
			close()
	case r == 0:
		pb.moveTo(topLeft).
			lineTo(topRight).
			lineTo(point{round1(width), round1(height)}).
			lineTo(point{0, round1(height)}).
			lineTo(topLeft).
			close()
	default:
		rightStraight := point{round1(width), round1(height - r)}
		rightCorner := point{round1(width - r), round1(height)}
		leftCorner := point{round1(r), round1(height)}
		leftStraight := point{0, round1(height - r)}
		pb.moveTo(topLeft).
			lineTo(topRight).
			lineTo(rightStraight).
			curveTo(
				point{round1(width), round1(height - r + k)},
				point{round1(width - r + k), round1(height)},
				rightCorner,
			).
			lineTo(leftCorner).
			curveTo(
				point{round1(r - k), round1(height)},
				point{0, round1(height - r + k)},
				leftStraight,
			).
			lineTo(topLeft).
			close()
	}

	return Piece{
		Name:     name,
		PathData: pb.String(),
		Width:    round1(width),
		Height:   round1(height),
		Notes:    "Patch pocket. Hem the top edge, press the seam allowance under on the other three sides, then topstitch onto the garment at the marked position.",
		Anchor:   &Point{X: round1(anchorX), Y: round1(anchorY)},
	}
}

// normalizeDegrees folds an angle into (-180, 180] and rounds it to a whole degree.
func normalizeDegrees(deg float64) float64 {
	deg = math.Mod(deg, 360)
	if deg > 180 {
		deg -= 360
	} else if deg <= -180 {
		deg += 360
	}
	return math.Round(deg)
}

func turnDirection(deg float64) string {
	if deg > 0 {
		return "clockwise"
	}
	return "anticlockwise"
}

// sleeveFace names the side of the sleeve a sleeve extra was placed on.
func sleeveFace(acc Accessory) string {
	if acc.Segment != SegmentLeftSleeve && acc.Segment != SegmentRightSleeve {
		return ""
	}
	switch acc.View {
	case "front", "back":
		return acc.View
	case "left", "right":
		return "outside"
	}
	return ""
}
