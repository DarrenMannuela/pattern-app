// Package nesting implements a shelf-packing (Next-Fit Decreasing Height)
// algorithm for laying out rectangular pattern pieces on a fixed-width
// fabric roll with minimum wasted length.
//
// This is intentionally a bounding-box packer, not a true no-fit-polygon
// nester: it treats every piece as a rectangle. That is a reasonable
// approximation for planning yardage, but a true irregular-shape nester
// (following each piece's actual cut curves) will always pack tighter.
package nesting

import "sort"

// Piece is a pattern piece as entered by the user, before expanding
// by quantity.
type Piece struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Width       float64 `json:"width"`
	Height      float64 `json:"height"`
	Qty         int     `json:"qty"`
	Color       string  `json:"color"`
	GrainLocked bool    `json:"grainLocked"`
}

// Placed is a single instance of a piece after it has been positioned
// on the fabric.
type Placed struct {
	Name        string  `json:"name"`
	Color       string  `json:"color"`
	GrainLocked bool    `json:"grainLocked"`
	Rotated     bool    `json:"rotated"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	W           float64 `json:"w"`
	H           float64 `json:"h"`
}

// Result is the full outcome of a pack, including summary stats the
// frontend renders in the stat bar.
type Result struct {
	Placed      []Placed `json:"placed"`
	FabricWidth float64  `json:"fabricWidth"`
	TotalHeight float64  `json:"totalHeight"`
	Efficiency  float64  `json:"efficiency"`
	WasteArea   float64  `json:"wasteArea"`
	PieceCount  int      `json:"pieceCount"`
}

type instance struct {
	name        string
	color       string
	grainLocked bool
	rotated     bool
	w, h        float64
}

type shelf struct {
	y, height, usedWidth float64
}

// Pack lays out all pieces (expanded by their quantity) onto a fabric
// roll of the given width, padding each piece by seamAllowance on
// every side first.
func Pack(pieces []Piece, fabricWidth, seamAllowance float64) Result {
	var instances []instance
	for _, p := range pieces {
		for i := 0; i < p.Qty; i++ {
			instances = append(instances, instance{
				name:        p.Name,
				color:       p.Color,
				grainLocked: p.GrainLocked,
				w:           p.Width + seamAllowance*2,
				h:           p.Height + seamAllowance*2,
			})
		}
	}

	// If a piece is wider than the fabric but would fit rotated,
	// and rotation is allowed, rotate it up front.
	for i := range instances {
		inst := &instances[i]
		if !inst.grainLocked && inst.w > fabricWidth && inst.h <= fabricWidth {
			inst.w, inst.h = inst.h, inst.w
			inst.rotated = true
		}
	}

	// Tallest-first is the standard shelf heuristic: it keeps shelves
	// as short as possible, so later shorter pieces can share a shelf.
	sort.Slice(instances, func(i, j int) bool {
		return instances[i].h > instances[j].h
	})

	var shelves []*shelf
	var placed []Placed
	var totalHeight float64

	for _, inst := range instances {
		var target *shelf

		for _, s := range shelves {
			if s.usedWidth+inst.w <= fabricWidth && inst.h <= s.height {
				target = s
				break
			}
		}

		// Try rotating to fit an existing shelf, if rotation is allowed.
		if target == nil && !inst.grainLocked {
			for _, s := range shelves {
				if s.usedWidth+inst.h <= fabricWidth && inst.w <= s.height {
					inst.w, inst.h = inst.h, inst.w
					inst.rotated = !inst.rotated
					target = s
					break
				}
			}
		}

		if target == nil {
			target = &shelf{y: totalHeight, height: inst.h}
			shelves = append(shelves, target)
			totalHeight += inst.h
		}

		placed = append(placed, Placed{
			Name:        inst.name,
			Color:       inst.color,
			GrainLocked: inst.grainLocked,
			Rotated:     inst.rotated,
			X:           target.usedWidth,
			Y:           target.y,
			W:           inst.w,
			H:           inst.h,
		})
		target.usedWidth += inst.w
	}

	var pieceArea float64
	for _, p := range placed {
		pieceArea += p.W * p.H
	}
	fabricArea := fabricWidth * totalHeight
	efficiency := 0.0
	if fabricArea > 0 {
		efficiency = pieceArea / fabricArea * 100
	}

	return Result{
		Placed:      placed,
		FabricWidth: fabricWidth,
		TotalHeight: totalHeight,
		Efficiency:  efficiency,
		WasteArea:   fabricArea - pieceArea,
		PieceCount:  len(placed),
	}
}
