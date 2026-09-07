package nesting

import (
	"math"
	"strconv"
	"strings"
)

// Point is a 2D coordinate in centimeters.
type Point struct{ X, Y float64 }

const curveSegments = 14 // bezier flattening resolution

// ParsePath flattens an SVG path string (M/L/C/Z, absolute coordinates
// only — the only commands this project's path builders ever emit)
// into an ordered list of polygon points, subdividing any cubic
// bezier curves into straight segments.
func ParsePath(d string) []Point {
	var points []Point
	var cur Point

	i := 0
	runes := []rune(d)
	for i < len(runes) {
		c := runes[i]
		if !strings.ContainsRune("MLCZ", c) {
			i++
			continue
		}
		i++
		// Collect the numeric run belonging to this command.
		start := i
		for i < len(runes) && !strings.ContainsRune("MLCZ", runes[i]) {
			i++
		}
		nums := parseNums(string(runes[start:i]))

		switch c {
		case 'M', 'L':
			if len(nums) >= 2 {
				cur = Point{nums[0], nums[1]}
				points = append(points, cur)
			}
		case 'C':
			if len(nums) >= 6 {
				c1 := Point{nums[0], nums[1]}
				c2 := Point{nums[2], nums[3]}
				end := Point{nums[4], nums[5]}
				for s := 1; s <= curveSegments; s++ {
					t := float64(s) / float64(curveSegments)
					points = append(points, cubicPoint(cur, c1, c2, end, t))
				}
				cur = end
			}
		case 'Z':
			// closing the path — no extra point needed, the fill
			// routine treats the point list as an implicitly closed ring
		}
	}
	return points
}

func parseNums(s string) []float64 {
	fields := strings.FieldsFunc(s, func(r rune) bool {
		return r == ',' || r == ' '
	})
	out := make([]float64, 0, len(fields))
	for _, f := range fields {
		if f == "" {
			continue
		}
		v, err := strconv.ParseFloat(f, 64)
		if err == nil {
			out = append(out, v)
		}
	}
	return out
}

func cubicPoint(p0, p1, p2, p3 Point, t float64) Point {
	mt := 1 - t
	a := mt * mt * mt
	b := 3 * mt * mt * t
	c := 3 * mt * t * t
	dd := t * t * t
	return Point{
		X: a*p0.X + b*p1.X + c*p2.X + dd*p3.X,
		Y: a*p0.Y + b*p1.Y + c*p2.Y + dd*p3.Y,
	}
}

// RectPath synthesizes a plain rectangle path — used for pieces that
// were hand-entered as a width/height rather than drafted with real
// curves, so they flow through the same nesting pipeline as everything
// else instead of needing special-case handling.
func RectPath(w, h float64) string {
	return "M0.0,0.0 L" + fmtF(w) + ",0.0 L" + fmtF(w) + "," + fmtF(h) + " L0.0," + fmtF(h) + " Z"
}

func fmtF(v float64) string {
	return strconv.FormatFloat(v, 'f', 1, 64)
}

func round1(v float64) float64 {
	return math.Round(v*10) / 10
}

// BoundingBox returns the min/max extent of a point set.
func BoundingBox(points []Point) (minX, minY, maxX, maxY float64) {
	if len(points) == 0 {
		return 0, 0, 0, 0
	}
	minX, minY = points[0].X, points[0].Y
	maxX, maxY = points[0].X, points[0].Y
	for _, p := range points[1:] {
		minX = math.Min(minX, p.X)
		minY = math.Min(minY, p.Y)
		maxX = math.Max(maxX, p.X)
		maxY = math.Max(maxY, p.Y)
	}
	return
}

// RotatePoints rotates a point set about the origin by the given
// degrees (must be a multiple of 90 — the only rotations the nester
// considers, since fabric grain constraints mean arbitrary angles
// aren't useful here).
func RotatePoints(points []Point, deg int) []Point {
	rad := float64(deg) * math.Pi / 180
	sin, cos := math.Sin(rad), math.Cos(rad)
	out := make([]Point, len(points))
	for i, p := range points {
		out[i] = Point{
			X: p.X*cos - p.Y*sin,
			Y: p.X*sin + p.Y*cos,
		}
	}
	return out
}

// PolygonArea computes the area enclosed by a point set via the
// shoelace formula. Rotation doesn't change the result, so this is
// computed once from the original (unrotated) outline.
func PolygonArea(points []Point) float64 {
	if len(points) < 3 {
		return 0
	}
	sum := 0.0
	n := len(points)
	for i := 0; i < n; i++ {
		j := (i + 1) % n
		sum += points[i].X*points[j].Y - points[j].X*points[i].Y
	}
	return math.Abs(sum) / 2
}

// mask is a boolean occupancy grid: mask[row][col].
type mask [][]bool

// buildMask rasterizes a polygon onto a grid at the given resolution
// (cm per cell), padded on all sides by marginCells of empty space so
// a later dilation (for seam allowance) has room to grow without
// clipping. Returns the mask plus originX/originY: the local
// coordinate (in the polygon's own coordinate space) that grid cell
// (0,0)'s top-left corner corresponds to.
func buildMask(points []Point, resolution float64, marginCells int) (m mask, cols, rows int, originX, originY float64) {
	minX, minY, maxX, maxY := BoundingBox(points)
	margin := float64(marginCells) * resolution

	shiftX := -minX + margin
	shiftY := -minY + margin
	shifted := make([]Point, len(points))
	for i, p := range points {
		shifted[i] = Point{p.X + shiftX, p.Y + shiftY}
	}

	width := (maxX - minX) + 2*margin
	height := (maxY - minY) + 2*margin
	cols = int(math.Ceil(width/resolution)) + 1
	rows = int(math.Ceil(height/resolution)) + 1
	if cols < 1 {
		cols = 1
	}
	if rows < 1 {
		rows = 1
	}

	m = scanlineFill(shifted, resolution, cols, rows)
	originX = minX - margin
	originY = minY - margin
	return
}

// scanlineFill fills a polygon onto a grid using the standard
// even-odd scanline algorithm, sampling at each cell's vertical
// center so single-cell-wide slivers still register.
func scanlineFill(points []Point, resolution float64, cols, rows int) mask {
	m := make(mask, rows)
	for r := range m {
		m[r] = make([]bool, cols)
	}
	if len(points) < 3 {
		return m
	}

	n := len(points)
	for row := 0; row < rows; row++ {
		y := (float64(row) + 0.5) * resolution
		var xs []float64
		for i := 0; i < n; i++ {
			a := points[i]
			b := points[(i+1)%n]
			if (a.Y <= y && b.Y > y) || (b.Y <= y && a.Y > y) {
				t := (y - a.Y) / (b.Y - a.Y)
				xs = append(xs, a.X+t*(b.X-a.X))
			}
		}
		if len(xs) < 2 {
			continue
		}
		// sort intersections (small slice, simple insertion sort is fine)
		for i := 1; i < len(xs); i++ {
			for j := i; j > 0 && xs[j-1] > xs[j]; j-- {
				xs[j-1], xs[j] = xs[j], xs[j-1]
			}
		}
		for i := 0; i+1 < len(xs); i += 2 {
			startCol := int(math.Floor(xs[i] / resolution))
			endCol := int(math.Ceil(xs[i+1] / resolution))
			if startCol < 0 {
				startCol = 0
			}
			if endCol > cols {
				endCol = cols
			}
			for c := startCol; c < endCol; c++ {
				m[row][c] = true
			}
		}
	}
	return m
}

// dilate grows every true cell outward by radiusCells (a square
// dilation — a reasonable, cheap approximation of a true offset
// curve for the purpose of leaving seam-allowance breathing room
// between pieces).
func dilate(m mask, radiusCells int) mask {
	if radiusCells <= 0 {
		return m
	}
	rows := len(m)
	if rows == 0 {
		return m
	}
	cols := len(m[0])
	out := make(mask, rows)
	for r := range out {
		out[r] = make([]bool, cols)
	}
	for r := 0; r < rows; r++ {
		for c := 0; c < cols; c++ {
			if !m[r][c] {
				continue
			}
			for dr := -radiusCells; dr <= radiusCells; dr++ {
				nr := r + dr
				if nr < 0 || nr >= rows {
					continue
				}
				for dc := -radiusCells; dc <= radiusCells; dc++ {
					nc := c + dc
					if nc < 0 || nc >= cols {
						continue
					}
					out[nr][nc] = true
				}
			}
		}
	}
	return out
}
