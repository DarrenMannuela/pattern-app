// Add-ons layered onto a base garment — a patch pocket, an
// embroidery/logo placement — independent of which style or garment
// type is being drafted, so the same options work whether it's a
// school shirt, a pair of trousers, or a skirt.
package draft

import "math"

// AddOns are the extras a customer might ask for on top of the base
// garment. Which ones apply depends on the garment type: ChestPocket
// only makes sense on a shirt, BackPocket on trousers/shorts/a skirt.
type AddOns struct {
	ChestPocket bool        `json:"chestPocket"`
	BackPocket  bool        `json:"backPocket"`
	Embroidery  *Embroidery `json:"embroidery,omitempty"`
}

// Embroidery is placement metadata only — unlike a pocket it doesn't
// cut its own piece, just a position/size/label recorded on the order
// for production and shown as a marker in the garment preview.
type Embroidery struct {
	Placement string  `json:"placement"` // "left_chest" | "right_chest" | "back" | "sleeve"
	Width     float64 `json:"width"`
	Height    float64 `json:"height"`
	Label     string  `json:"label"`
}

// draftPatchPocket drafts a simple rectangular patch pocket with
// gently rounded bottom corners — cut separately and topstitched onto
// the garment, the most common pocket on konveksi uniform work (welt
// and besom pockets need a slash in the main piece itself, a
// different and more involved construction). anchorX/anchorY report
// where its top-center should sit on the parent piece it's meant for,
// in that piece's own local coordinates, so a caller can position it
// without guessing.
func draftPatchPocket(width, height, anchorX, anchorY float64, name string) Piece {
	if width == 0 {
		width = 12
	}
	if height == 0 {
		height = 13
	}
	r := math.Min(width, height) * 0.18 // bottom corner rounding radius
	k := r * 0.552                      // cubic-bezier circular-arc approximation constant

	topLeft := point{0, 0}
	topRight := point{round1(width), 0}
	rightStraight := point{round1(width), round1(height - r)}
	rightCorner := point{round1(width - r), round1(height)}
	leftCorner := point{round1(r), round1(height)}
	leftStraight := point{0, round1(height - r)}

	pb := &pathBuilder{}
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

	return Piece{
		Name:     name,
		PathData: pb.String(),
		Width:    round1(width),
		Height:   round1(height),
		Notes:    "Patch pocket. Hem the top edge, press the seam allowance under on the other three sides, then topstitch onto the garment at the marked position.",
		Anchor:   &Point{X: round1(anchorX), Y: round1(anchorY)},
	}
}
