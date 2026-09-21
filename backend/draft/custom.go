package draft

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// A custom design is drawn by the user (traced over a picture of a uniform,
// or from scratch) as closed outlines in cm. Each outline becomes a cutting
// piece, so it gets the same seam allowance, grainline and cut count as any
// drafted piece and goes into the same cutting layout.

// CustomOptions is the set of drawn pieces.
type CustomOptions struct {
	Pieces []CustomPiece `json:"pieces"`
}

// CustomPiece is one drawn outline. PathData uses absolute M/L/C/Z commands
// in cm, with any origin; it is moved to the origin here.
type CustomPiece struct {
	Name     string `json:"name"`
	PathData string `json:"pathData"`
	// FoldEdge: "" (a full piece), "left" or "bottom" (drawn as a half, cut
	// on that fold).
	FoldEdge string `json:"foldEdge"`
	// Qty is how many copies to cut (1 when unset).
	Qty   int    `json:"qty"`
	Notes string `json:"notes"`
}

const (
	maxCustomPieces = 60
	maxCustomCm     = 400.0
)

// ErrNoCustomPieces is returned when a custom design has nothing drawn yet.
var ErrNoCustomPieces = errors.New("draw at least one closed piece before generating patterns")

// DraftCustom turns drawn outlines into pieces, rejecting anything that
// can't be cut (open, degenerate, or absurdly large shapes).
func DraftCustom(o CustomOptions) ([]Piece, error) {
	if len(o.Pieces) == 0 {
		return nil, ErrNoCustomPieces
	}
	if len(o.Pieces) > maxCustomPieces {
		return nil, fmt.Errorf("a custom design can have at most %d pieces", maxCustomPieces)
	}
	var out []Piece
	for i, cp := range o.Pieces {
		name := strings.TrimSpace(cp.Name)
		if name == "" {
			name = fmt.Sprintf("Piece %d", i+1)
		}
		poly := flattenPath(cp.PathData)
		if len(poly) < 3 {
			return nil, fmt.Errorf("%q has fewer than 3 points", name)
		}
		minX, minY, maxX, maxY := math.Inf(1), math.Inf(1), math.Inf(-1), math.Inf(-1)
		for _, p := range poly {
			if math.IsNaN(p.x) || math.IsNaN(p.y) || math.IsInf(p.x, 0) || math.IsInf(p.y, 0) {
				return nil, fmt.Errorf("%q has an invalid coordinate", name)
			}
			minX, minY = math.Min(minX, p.x), math.Min(minY, p.y)
			maxX, maxY = math.Max(maxX, p.x), math.Max(maxY, p.y)
		}
		w, h := maxX-minX, maxY-minY
		if w > maxCustomCm || h > maxCustomCm {
			return nil, fmt.Errorf("%q is %.0f x %.0f cm — check the picture's scale", name, w, h)
		}
		if polygonArea(poly) < 1 {
			return nil, fmt.Errorf("%q is too small to cut (under 1 cm²)", name)
		}
		fold := cp.FoldEdge
		if fold != "left" && fold != "bottom" {
			fold = ""
		}
		qty := cp.Qty
		if qty < 1 {
			qty = 1
		}
		if qty > 999 {
			qty = 999
		}
		notes := cp.Notes
		if notes == "" {
			notes = "Custom piece traced from your design."
			if fold != "" {
				notes += " Drawn as a half — cut on the fold."
			}
		}
		out = append(out, Piece{
			Name:     name,
			PathData: shiftPath(cp.PathData, -minX, -minY),
			Width:    round1(w),
			Height:   round1(h),
			FoldEdge: fold,
			Qty:      qty,
			Notes:    notes,
		})
	}
	return out, nil
}

// polygonArea is the absolute area of a polygon (shoelace).
func polygonArea(pts []point) float64 {
	a := 0.0
	for i := range pts {
		j := (i + 1) % len(pts)
		a += pts[i].x*pts[j].y - pts[j].x*pts[i].y
	}
	return math.Abs(a) / 2
}

// shiftPath moves every coordinate of an absolute M/L/C/Z path by (dx, dy).
func shiftPath(d string, dx, dy float64) string {
	toks := strings.Fields(strings.NewReplacer("M", " M ", "L", " L ", "C", " C ", "Z", " Z ", ",", " ").Replace(d))
	var b strings.Builder
	for i := 0; i < len(toks); {
		cmd := toks[i]
		i++
		n := 0
		switch cmd {
		case "M", "L":
			n = 2
		case "C":
			n = 6
		case "Z":
			b.WriteString("Z")
			continue
		default:
			continue
		}
		b.WriteString(cmd)
		for k := 0; k < n && i < len(toks); k++ {
			v, _ := strconv.ParseFloat(toks[i], 64)
			i++
			if k%2 == 0 {
				v += dx
			} else {
				v += dy
			}
			if k > 0 {
				if k%2 == 0 {
					b.WriteString(" ")
				} else {
					b.WriteString(",")
				}
			}
			b.WriteString(strconv.FormatFloat(math.Round(v*10)/10, 'f', 1, 64))
		}
		b.WriteString(" ")
	}
	return strings.TrimSpace(b.String())
}
