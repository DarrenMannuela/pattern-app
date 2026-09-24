// Package cutplan plans the cutting of a whole order the way a cutting room
// does. Nesting every garment of an order into one giant layout is neither how
// cloth is cut nor fast to compute; instead the order is split into lays. A
// lay is a stack of identical plies of fabric cut to one marker, and a marker
// is a single nested layout of one or more garments (a size ratio such as
// 1 S : 2 M : 1 L). The fabric an order needs is the sum, over its lays, of
// (marker length + end allowance) x plies.
package cutplan

import (
	"fmt"
	"math"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"patternapp/backend/draft"
	"patternapp/backend/nesting"
)

// Params are the choices that shape a plan. Zero values mean "the usual".
type Params struct {
	// FabricWidth is the usable width in cm (the roll's width less its selvedges).
	FabricWidth float64
	// MaxPlies is the tallest stack the cutting machine takes (about 50 to 100).
	MaxPlies int
	// MaxGarments is the most garments in one marker; a longer marker needs a
	// longer table and is harder to spread.
	MaxGarments int
	// SingleSizes forbids mixing sizes in a marker. Mixing usually saves fabric.
	SingleSizes bool
	// OneWay is for fabric with a direction (a nap, a batik or printed motif):
	// no piece may be turned end for end, which costs some cloth.
	OneWay bool
	// StripeLength and StripeWidth are the main fabric's stripe or check
	// repeat in cm: StripeLength for bands running across the fabric (a repeat
	// along the roll), StripeWidth for stripes running down it. The pieces
	// that show are placed on the repeat so the stripes meet at the seams.
	StripeLength, StripeWidth float64
	// Tubular is for circular knit sold as a tube: FabricWidth is the tube
	// laid flat, so every ply is two layers. A half piece drawn against a fold
	// is laid on the tube's folded edge and comes out whole; any other piece
	// comes out as a pair.
	Tubular bool
	// EndAllowance is the cloth lost at each end of every ply, in cm.
	EndAllowance float64
	// Spacing is the gap kept around each piece, in cm.
	Spacing float64
	// ShrinkLength and ShrinkWidth are the percent the fabric shrinks once
	// washed. Pieces are cut that much larger so they finish the right size.
	ShrinkLength, ShrinkWidth float64
	// ReservePercent is extra bought for defects and end-of-roll losses.
	ReservePercent float64
	// GSM is the fabric weight in g/m², to give the order's weight in kg.
	GSM float64
	// LayWidths, when given, are the widths the fabric can be bought in: each
	// lay is nested on every one and cut on whichever takes the least cloth.
	// Knit tubes come in many widths, and one that suits a size can waste a
	// quarter of the cloth on the next size up.
	LayWidths []float64
	// PricePerMeter and PricePerKg price the fabric to buy (per kg needs GSM).
	PricePerMeter, PricePerKg float64
	// Budget is how long each marker may spend looking for a tighter layout.
	Budget time.Duration
}

const (
	defaultPlies       = 50
	defaultGarments    = 4
	defaultEndAllowCm  = 2.0
	defaultSpacingCm   = 0.25
	defaultReservePct  = 3.0
	defaultMarkerLimit = 2 * time.Second
)

// WithDefaults fills every unset field with a usual value. Fields where zero is
// a real choice (allowance, shrinkage, reserve) are left as given.
func (p Params) WithDefaults() Params {
	if p.MaxPlies <= 0 {
		p.MaxPlies = defaultPlies
	}
	if p.MaxGarments <= 0 {
		p.MaxGarments = defaultGarments
	}
	if p.Spacing <= 0 {
		p.Spacing = defaultSpacingCm
	}
	if p.Budget <= 0 {
		p.Budget = defaultMarkerLimit
	}
	return p
}

// SizeCount is one size's share of a marker.
type SizeCount struct {
	Size  string `json:"size"`
	Count int    `json:"count"`
}

// Lay is one stack of plies cut to one marker.
type Lay struct {
	Ratio          []SizeCount `json:"ratio"`
	WidthCm        float64     `json:"widthCm"`
	Plies          int         `json:"plies"`
	Garments       int         `json:"garments"` // Plies x the marker's garments
	MarkerLengthCm float64     `json:"markerLengthCm"`
	Efficiency     float64     `json:"efficiency"` // percent of the marker's area that is pattern piece
	FabricCm       float64     `json:"fabricCm"`   // (marker + end allowance) x plies
	// Marker is the layout itself, to draw.
	Marker nesting.PolygonResult `json:"marker"`
}

// Plan is the cutting plan for one fabric of an order.
type Plan struct {
	Fabric        string  `json:"fabric"` // "main" or "contrast"
	FabricWidthCm float64 `json:"fabricWidthCm"`
	Garments      int     `json:"garments"`
	Lays          []Lay   `json:"lays"`
	LengthCm      float64 `json:"lengthCm"` // all lays, before the reserve
	Meters        float64 `json:"meters"`
	BuyMeters     float64 `json:"buyMeters"` // with the reserve, rounded up to 0.1 m
	AreaM2        float64 `json:"areaM2"`
	PerGarmentM   float64 `json:"perGarmentM"`
	// Efficiency is the pattern pieces' share of all the cloth spread, end
	// allowances included.
	Efficiency float64 `json:"efficiency"`
	WeightKg   float64 `json:"weightKg,omitempty"`
	// GarmentsPerKg is how the knit trade counts yield (e.g. "5 size L per
	// kilo"), when the fabric weight is known.
	GarmentsPerKg float64 `json:"garmentsPerKg,omitempty"`
	Tubular       bool    `json:"tubular,omitempty"`
	// ByWidth is how much of each width to buy, when lays use different widths.
	ByWidth []WidthUse `json:"byWidth,omitempty"`
	// Cost is the fabric to buy, priced; CostPerGarment spreads it over the order.
	Cost           float64 `json:"cost,omitempty"`
	CostPerGarment float64 `json:"costPerGarment,omitempty"`
	// Complete is false when some piece could not be placed (wider than the
	// fabric, say), in which case the totals are too small.
	Complete bool     `json:"complete"`
	Warnings []string `json:"warnings,omitempty"`
	// Notes explain choices the planner made on its own.
	Notes []string `json:"notes,omitempty"`
}

// WidthUse is the cloth to buy in one width.
type WidthUse struct {
	WidthCm   float64 `json:"widthCm"`
	Meters    float64 `json:"meters"`
	BuyMeters float64 `json:"buyMeters"`
	WeightKg  float64 `json:"weightKg,omitempty"`
}

// Sizes is what an order asks for: the size labels in chart order, how many
// garments of each, and each size's drafted pieces.
type Sizes struct {
	Order  []string
	Demand map[string]int
	Pieces map[string][]draft.Piece
}

// fabricOf says which fabric a piece is cut from.
func fabricOf(p draft.Piece) string {
	if p.Fabric == "contrast" {
		return "contrast"
	}
	return "main"
}

// Fabrics lists the fabrics the order's pieces are cut from, main first.
func (s Sizes) Fabrics() []string {
	seen := map[string]bool{}
	for _, label := range s.Order {
		if s.Demand[label] <= 0 {
			continue
		}
		for _, p := range s.Pieces[label] {
			seen[fabricOf(p)] = true
		}
	}
	var out []string
	for _, f := range []string{"main", "contrast"} {
		if seen[f] {
			out = append(out, f)
		}
	}
	return out
}

type layPlan struct {
	ratio []SizeCount
	plies int
}

// planLays splits the order into lays, following the usual cut-order rule: use
// the full ply height and as few markers as possible. Each round it picks the
// marker (a size ratio of at most maxGarments) and ply count that cover the most
// garments without over-cutting any size, preferring bigger, more mixed markers
// on a tie, and repeats until nothing is left.
func planLays(sizes []string, demand map[string]int, maxPlies, maxGarments int, single bool) []layPlan {
	rem := make(map[string]int, len(sizes))
	left := 0
	for _, s := range sizes {
		rem[s] = max(0, demand[s])
		left += rem[s]
	}
	var out []layPlan
	for left > 0 {
		ratio := make([]int, len(sizes))
		var best []int
		bestPlies, bestCovered, bestSum, bestKinds := 0, 0, 0, 0
		var walk func(i, room int)
		walk = func(i, room int) {
			if i == len(sizes) {
				sum, kinds, plies := 0, 0, maxPlies
				for j, r := range ratio {
					if r == 0 {
						continue
					}
					sum += r
					kinds++
					plies = min(plies, rem[sizes[j]]/r)
				}
				if sum == 0 || plies == 0 || (single && kinds > 1) {
					return
				}
				covered := plies * sum
				if covered > bestCovered ||
					(covered == bestCovered && (sum > bestSum || (sum == bestSum && kinds > bestKinds))) {
					best = append(best[:0], ratio...)
					bestPlies, bestCovered, bestSum, bestKinds = plies, covered, sum, kinds
				}
				return
			}
			for r := 0; r <= room && r <= rem[sizes[i]]; r++ {
				ratio[i] = r
				walk(i+1, room-r)
			}
			ratio[i] = 0
		}
		walk(0, maxGarments)
		if best == nil {
			break // unreachable while garments remain: a single garment always fits
		}
		lp := layPlan{plies: bestPlies}
		for j, r := range best {
			if r > 0 {
				lp.ratio = append(lp.ratio, SizeCount{Size: sizes[j], Count: r})
				rem[sizes[j]] -= r * bestPlies
				left -= r * bestPlies
			}
		}
		out = append(out, lp)
	}
	return out
}

func ratioKey(r []SizeCount) string {
	var b strings.Builder
	for _, sc := range r {
		fmt.Fprintf(&b, "%s×%d|", sc.Size, sc.Count)
	}
	return b.String()
}

// sizeColors tell the sizes apart when a marker is drawn.
var sizeColors = []string{"#3B7A82", "#C79A3E", "#7A5B9C", "#B5453D", "#4B8C5A", "#5B6E9C", "#C0724A", "#6E8B3D"}

// minMatchedArea is the smallest piece (cm²) that is placed on the stripe
// repeat. Fronts, backs, sleeves, yokes and collars show the stripes and are
// matched; small inner pieces (facings, a placket strip, a cuff lining) aren't.
// Pockets always are, since a pocket sits on a front and must line up with it.
const minMatchedArea = 150.0

func matched(pc draft.Piece, w, h float64) bool {
	return w*h >= minMatchedArea || strings.Contains(strings.ToLower(pc.Name), "pocket")
}

// markerPieces are the nesting pieces for one marker of one fabric. A half
// drafted against a fold is cut as one whole piece, so it is unfolded here;
// with edgeFold on tubular knit it is instead laid against the tube's folded
// edge, which cuts it whole too.
func markerPieces(s Sizes, fabric string, ratio []SizeCount, p Params, edgeFold bool) []nesting.NestPiece {
	sx, sy := 1/(1-p.ShrinkWidth/100), 1/(1-p.ShrinkLength/100)
	stripes := fabric == "main" && (p.StripeLength > 0 || p.StripeWidth > 0)
	var out []nesting.NestPiece
	for _, sc := range ratio {
		colour := sizeColors[indexOf(s.Order, sc.Size)%len(sizeColors)]
		for _, pc := range s.Pieces[sc.Size] {
			if fabricOf(pc) != fabric {
				continue
			}
			path, w, h := pc.CutPathData, pc.CutWidth, pc.CutHeight
			if path == "" {
				path, w, h = pc.PathData, pc.Width, pc.Height
			}
			qty := max(1, pc.Qty) * sc.Count
			foldHalf := pc.FoldEdge == "left" && max(1, pc.Qty)%2 == 0
			if foldHalf && !(p.Tubular && edgeFold) {
				path, w = nesting.UnfoldPath(path)
				qty /= 2
			}
			np := nesting.NestPiece{
				Name:        fmt.Sprintf("%s (%s)", pc.Name, sc.Size),
				Color:       colour,
				GrainLocked: true,
				OneWay:      p.OneWay,
				PathData:    nesting.ScalePath(path, sx, sy),
				Width:       w * sx,
				Height:      h * sy,
				Qty:         qty,
			}
			if stripes && matched(pc, w, h) {
				np.MatchLength, np.MatchWidth = p.StripeLength, p.StripeWidth
				np.MatchX = w * sx / 2 // the centre, which on an unfolded piece is its fold
				if foldHalf && p.Tubular && edgeFold {
					np.MatchX = 0
				}
			}
			if !p.Tubular && !foldHalf && np.Qty >= 2 && np.Qty%2 == 0 {
				// A pair (left and right front, two sleeves) is two mirror
				// images; spread face up, half are cut the other way round.
				mirror := np
				mirror.PathData = nesting.MirrorPath(np.PathData)
				mirror.Qty = np.Qty / 2
				if mirror.MatchWidth > 0 {
					mirror.MatchX = np.Width - np.MatchX
				}
				np.Qty /= 2
				out = append(out, mirror)
			}
			if p.Tubular {
				if foldHalf && edgeFold {
					// Each half against the tube's fold is one whole piece.
					np.Qty = qty / 2
					np.FoldAtEdge = true
				} else {
					// Cut through both layers, every placement gives two.
					np.Qty = (qty + 1) / 2
				}
			}
			out = append(out, np)
		}
	}
	return out
}

func indexOf(list []string, s string) int {
	for i, v := range list {
		if v == s {
			return i
		}
	}
	return 0
}

// Build plans the cutting of one fabric of the order.
func Build(s Sizes, fabric string, p Params) Plan {
	p = p.WithDefaults()
	plan := Plan{Fabric: fabric, FabricWidthCm: p.FabricWidth, Complete: true, Tubular: p.Tubular}

	var sizes []string
	for _, label := range s.Order {
		if s.Demand[label] > 0 {
			sizes = append(sizes, label)
			plan.Garments += s.Demand[label]
		}
	}
	lays := planLays(sizes, s.Demand, p.MaxPlies, p.MaxGarments, p.SingleSizes)

	widths := []float64{p.FabricWidth}
	if len(p.LayWidths) > 0 {
		widths = uniqueWidths(p.LayWidths)
		plan.FabricWidthCm = 0 // chosen per lay
	}
	byKey := map[string][]SizeCount{}
	var keys []string
	for _, lp := range lays {
		k := ratioKey(lp.ratio)
		if _, ok := byKey[k]; !ok {
			byKey[k] = lp.ratio
			keys = append(keys, k)
		}
	}

	// Every marker on every width, nested side by side on the machine's cores;
	// each marker keeps the width that takes the least cloth.
	type job struct {
		key   string
		width float64
	}
	results := map[job]nesting.PolygonResult{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	gate := make(chan struct{}, max(1, runtime.NumCPU()))
	for _, k := range keys {
		for _, w := range widths {
			wg.Add(1)
			gate <- struct{}{}
			go func(j job) {
				defer wg.Done()
				defer func() { <-gate }()
				res := nestMarker(s, fabric, byKey[j.key], p, j.width)
				mu.Lock()
				results[j] = res
				mu.Unlock()
			}(job{k, w})
		}
	}
	wg.Wait()
	markers := map[string]nesting.PolygonResult{}
	for _, k := range keys {
		var best nesting.PolygonResult
		found := false
		for _, w := range widths {
			res := results[job{k, w}]
			if !found || len(res.Unplaced) < len(best.Unplaced) ||
				(len(res.Unplaced) == len(best.Unplaced) && res.TotalHeight*res.FabricWidth < best.TotalHeight*best.FabricWidth) {
				best, found = res, true
			}
		}
		markers[k] = best
	}

	// Efficiency is worked out from the garments each lay produces, not from
	// the marker: on a tube a half laid on the fold cuts a whole piece, so the
	// marker's own figure would count it at half its size.
	layers := 1.0
	if p.Tubular {
		layers = 2 // a flattened tube is two layers of cloth
	}
	garmentArea := garmentAreas(s, fabric, p)
	var pieceArea, clothArea float64
	perWidth := map[float64]float64{} // cm of cloth in each width
	for _, lp := range lays {
		res := markers[ratioKey(lp.ratio)]
		garments, area := 0, 0.0
		for _, sc := range lp.ratio {
			garments += sc.Count
			area += garmentArea[sc.Size] * float64(sc.Count)
		}
		eff := 0.0
		if res.TotalHeight > 0 {
			eff = area / (res.FabricWidth * res.TotalHeight * layers) * 100
		}
		lay := Lay{
			Ratio:          lp.ratio,
			WidthCm:        res.FabricWidth,
			Plies:          lp.plies,
			Garments:       lp.plies * garments,
			MarkerLengthCm: res.TotalHeight,
			Efficiency:     round1(eff),
			FabricCm:       (res.TotalHeight + p.EndAllowance) * float64(lp.plies),
			Marker:         res,
		}
		plan.Lays = append(plan.Lays, lay)
		plan.LengthCm += lay.FabricCm
		perWidth[res.FabricWidth] += lay.FabricCm
		clothArea += lay.FabricCm * res.FabricWidth * layers
		pieceArea += area * float64(lp.plies)
		if len(res.Unplaced) > 0 {
			plan.Complete = false
			plan.Warnings = append(plan.Warnings, unplacedWarning(res.Unplaced, res.FabricWidth))
		}
	}

	reserve := 1 + p.ReservePercent/100
	buy := func(cm float64) float64 { return math.Ceil(cm*reserve/10) / 10 }
	kg := func(cm2 float64) float64 { return round2(cm2 / 1e4 * reserve * p.GSM / 1000) }
	plan.Meters = round2(plan.LengthCm / 100)
	plan.AreaM2 = round2(clothArea / 1e4)
	for _, w := range widths {
		if cm := perWidth[w]; cm > 0 {
			use := WidthUse{WidthCm: w, Meters: round2(cm / 100), BuyMeters: buy(cm)}
			if p.GSM > 0 {
				use.WeightKg = kg(cm * w * layers)
			}
			plan.ByWidth = append(plan.ByWidth, use)
			plan.BuyMeters += use.BuyMeters
		}
	}
	plan.BuyMeters = round2(plan.BuyMeters)
	if len(plan.ByWidth) == 1 {
		plan.FabricWidthCm = plan.ByWidth[0].WidthCm
		if len(p.LayWidths) == 0 {
			plan.ByWidth = nil
		}
	}
	if plan.Garments > 0 {
		plan.PerGarmentM = round2(plan.LengthCm / 100 / float64(plan.Garments))
	}
	if clothArea > 0 {
		plan.Efficiency = round1(pieceArea / clothArea * 100)
	}
	if p.GSM > 0 {
		plan.WeightKg = kg(clothArea)
		if plan.WeightKg > 0 {
			plan.GarmentsPerKg = round1(float64(plan.Garments) / plan.WeightKg)
		}
	}
	switch {
	case p.PricePerKg > 0 && plan.WeightKg > 0:
		plan.Cost = math.Round(plan.WeightKg * p.PricePerKg)
	case p.PricePerMeter > 0:
		plan.Cost = math.Round(plan.BuyMeters * p.PricePerMeter)
	}
	if plan.Cost > 0 && plan.Garments > 0 {
		plan.CostPerGarment = math.Round(plan.Cost / float64(plan.Garments))
	}
	return plan
}

// BuildBest is Build, trying one more thing when each lay may pick its own
// width: lays of one size each, so every size gets the width that suits it.
// Mixing sizes usually saves cloth on one width, but on knit tubes the right
// width per size saves far more (a fifth of the cloth, measured on a PE-shirt
// order), so the planner tries both and keeps whichever needs less.
func BuildBest(s Sizes, fabric string, p Params) Plan {
	plan := Build(s, fabric, p)
	if len(p.LayWidths) == 0 || p.SingleSizes {
		return plan
	}
	q := p
	q.SingleSizes = true
	single := Build(s, fabric, q)
	if single.Complete && (!plan.Complete || single.AreaM2 < plan.AreaM2*0.99) {
		single.Notes = append(single.Notes, fmt.Sprintf("Each size was given its own lays, so each could go on the width that suits it: %.1f m² of cloth instead of %.1f m² with sizes mixed.", single.AreaM2, plan.AreaM2))
		return single
	}
	return plan
}

// nestMarker nests one marker on one width. On a tube, halves against the
// folded edges can beat whole pieces (and the other way round), so both are
// tried and the shorter kept.
func nestMarker(s Sizes, fabric string, ratio []SizeCount, p Params, width float64) nesting.PolygonResult {
	res := nesting.PackPolygonsWithin(markerPieces(s, fabric, ratio, p, false), width, p.Spacing, 0, p.Budget)
	if p.Tubular {
		alt := nesting.PackPolygonsWithin(markerPieces(s, fabric, ratio, p, true), width, p.Spacing, 0, p.Budget)
		if len(alt.Unplaced) < len(res.Unplaced) || (len(alt.Unplaced) == len(res.Unplaced) && alt.TotalHeight < res.TotalHeight) {
			res = alt
		}
	}
	return res
}

func uniqueWidths(ws []float64) []float64 {
	seen := map[float64]bool{}
	var out []float64
	for _, w := range ws {
		if w > 0 && !seen[w] {
			seen[w] = true
			out = append(out, w)
		}
	}
	sort.Float64s(out)
	return out
}

// garmentAreas is the cloth one garment of each size takes as cut pieces
// (cm²), in this fabric, enlarged for shrinkage like the markers are.
func garmentAreas(s Sizes, fabric string, p Params) map[string]float64 {
	scale := 1 / ((1 - p.ShrinkWidth/100) * (1 - p.ShrinkLength/100))
	out := map[string]float64{}
	for label, pieces := range s.Pieces {
		for _, pc := range pieces {
			if fabricOf(pc) != fabric {
				continue
			}
			path := pc.CutPathData
			if path == "" {
				path = pc.PathData
			}
			out[label] += nesting.PolygonArea(nesting.ParsePath(path)) * float64(max(1, pc.Qty)) * scale
		}
	}
	return out
}

func unplacedWarning(names []string, width float64) string {
	uniq := map[string]bool{}
	for _, n := range names {
		uniq[n] = true
	}
	list := make([]string, 0, len(uniq))
	for n := range uniq {
		list = append(list, n)
	}
	sort.Strings(list)
	if len(list) > 4 {
		list = append(list[:4], "…")
	}
	return fmt.Sprintf("Couldn't place %s on %.0f cm fabric: too wide, or too long for the roll. The totals are too small until this is fixed.", strings.Join(list, ", "), width)
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }
func round2(v float64) float64 { return math.Round(v*100) / 100 }

// WidthOption is what the order would need on one candidate fabric width.
type WidthOption struct {
	WidthCm    float64 `json:"widthCm"`
	Meters     float64 `json:"meters"`
	AreaM2     float64 `json:"areaM2"`
	Efficiency float64 `json:"efficiency"`
	Complete   bool    `json:"complete"`
	// WeightKg and GarmentsPerKg are set when the fabric weight is known.
	WeightKg      float64 `json:"weightKg,omitempty"`
	GarmentsPerKg float64 `json:"garmentsPerKg,omitempty"`
}

// CompareWidths plans the order's main fabric on each candidate width, so the
// cheapest width to buy can be seen. Fabric is bought by the metre, so the
// width that needs the fewest square metres is usually, though not always, the
// best buy: compare the prices per metre too.
func CompareWidths(s Sizes, widths []float64, p Params) []WidthOption {
	out := make([]WidthOption, len(widths))
	var wg sync.WaitGroup
	for i, w := range widths {
		wg.Add(1)
		go func(i int, w float64) {
			defer wg.Done()
			q := p
			q.FabricWidth = w
			q.LayWidths = nil
			plan := Build(s, "main", q)
			out[i] = WidthOption{WidthCm: w, Meters: plan.Meters, AreaM2: plan.AreaM2, Efficiency: plan.Efficiency, Complete: plan.Complete, WeightKg: plan.WeightKg, GarmentsPerKg: plan.GarmentsPerKg}
		}(i, w)
	}
	wg.Wait()
	return out
}
