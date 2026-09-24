package nesting

// bitGrid is the fabric's occupancy grid, packed 64 cells to a word so that
// testing whether a piece fits somewhere compares whole words, not single cells.
type bitGrid struct {
	cols  int
	words int
	rows  [][]uint64
}

func newBitGrid(cols int) *bitGrid {
	return &bitGrid{cols: cols, words: (cols + 63) / 64}
}

// ensureRows grows the grid, which has no fixed length, to at least n rows.
func (g *bitGrid) ensureRows(n int) {
	for len(g.rows) < n {
		g.rows = append(g.rows, make([]uint64, g.words))
	}
}

// shape is a rasterised piece ready to be tested against a bitGrid. A piece can
// start at any column, and its bits sit at a different offset inside a word for
// each, so the piece is kept pre-shifted for all 64 offsets (built when first
// needed) and a placement is just a word-wise AND.
type shape struct {
	rows, cols int
	base       [][]uint64 // rows of bits at offset 0
	shifted    [64][][]uint64
	area       float64 // the piece's own area, in cm², for the efficiency figure
}

func newShape(m mask, cols, rows int) *shape {
	s := &shape{rows: rows, cols: cols, base: make([][]uint64, rows)}
	for r := 0; r < rows; r++ {
		row := make([]uint64, (cols+63)/64)
		for c := 0; c < cols; c++ {
			if m[r][c] {
				row[c>>6] |= 1 << (uint(c) & 63)
			}
		}
		s.base[r] = row
	}
	s.shifted[0] = s.base
	return s
}

// at returns the piece's rows shifted right by off (0-63) cells.
func (s *shape) at(off int) [][]uint64 {
	if s.shifted[off] != nil {
		return s.shifted[off]
	}
	words := (s.cols + off + 63) / 64
	out := make([][]uint64, s.rows)
	for r, src := range s.base {
		row := make([]uint64, words)
		for i, w := range src {
			row[i] |= w << uint(off)
			if i+1 < words {
				row[i+1] |= w >> uint(64-off)
			}
		}
		out[r] = row
	}
	s.shifted[off] = out
	return out
}

// fits reports whether the piece can sit with its top-left cell at (fx, fy)
// without touching anything already placed. The caller keeps fx within the
// fabric width and has grown the grid to fy+rows.
func (g *bitGrid) fits(s *shape, fx, fy int) bool {
	wo := fx >> 6
	rows := s.at(fx & 63)
	for r, bits := range rows {
		occ := g.rows[fy+r][wo:]
		for w, b := range bits {
			if b&occ[w] != 0 {
				return false
			}
		}
	}
	return true
}

// stamp marks the piece's cells as taken.
func (g *bitGrid) stamp(s *shape, fx, fy int) {
	wo := fx >> 6
	rows := s.at(fx & 63)
	for r, bits := range rows {
		occ := g.rows[fy+r][wo:]
		for w, b := range bits {
			occ[w] |= b
		}
	}
}

// placeRule limits where a piece may go, in grid cells. A step of 0 leaves that
// direction free; otherwise the position must be phase more than a multiple of
// step (a stripe repeat). xOnly >= 0 allows that one column and no other (a
// piece whose fold must lie on the folded edge of tubular knit).
type placeRule struct {
	yStep, yPhase int
	xStep, xPhase int
	xOnly         int
}

var freePlacement = placeRule{xOnly: -1}

func (r placeRule) rowOK(fy int) bool { return r.yStep <= 0 || fy%r.yStep == r.yPhase }

// findPlacement scans the fabric bottom-left first (lowest row, then lowest
// column) for the first spot the piece fits within the rule. maxRows bounds
// how far down the roll it will look.
func (g *bitGrid) findPlacement(s *shape, maxRows int, rule placeRule) (fx, fy int, found bool) {
	if s.cols > g.cols || rule.xOnly > g.cols-s.cols {
		return 0, 0, false
	}
	xFrom, xTo, xBy := 0, g.cols-s.cols, 1
	switch {
	case rule.xOnly >= 0:
		xFrom, xTo = rule.xOnly, rule.xOnly
	case rule.xStep > 0:
		xFrom, xBy = rule.xPhase, rule.xStep
	}
	fy = 0
	if rule.yStep > 0 {
		fy = rule.yPhase
	}
	yBy := max(1, rule.yStep)
	for ; fy < maxRows; fy += yBy {
		g.ensureRows(fy + s.rows)
		for fx = xFrom; fx <= xTo; fx += xBy {
			if g.fits(s, fx, fy) {
				return fx, fy, true
			}
		}
	}
	return 0, 0, false
}
