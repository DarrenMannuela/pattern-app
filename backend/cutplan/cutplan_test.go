package cutplan

import (
	"math"
	"reflect"
	"strings"
	"testing"
	"time"

	"patternapp/backend/draft"
	"patternapp/backend/nesting"
	"patternapp/backend/orders"
)

// Whatever the order, the lays must cut exactly what was asked, within the
// machine's limits.
func checkLays(t *testing.T, sizes []string, demand map[string]int, lays []layPlan, maxPlies, maxGarments int) {
	t.Helper()
	got := map[string]int{}
	for _, l := range lays {
		if l.plies < 1 || l.plies > maxPlies {
			t.Errorf("lay has %d plies (limit %d)", l.plies, maxPlies)
		}
		in := 0
		for _, sc := range l.ratio {
			in += sc.Count
			got[sc.Size] += sc.Count * l.plies
		}
		if in < 1 || in > maxGarments {
			t.Errorf("marker holds %d garments (limit %d)", in, maxGarments)
		}
	}
	for _, s := range sizes {
		if got[s] != demand[s] {
			t.Errorf("size %s: cut %d, ordered %d", s, got[s], demand[s])
		}
	}
}

func TestPlanLaysCutsExactlyTheOrder(t *testing.T) {
	sizes := []string{"S", "M", "L", "XL", "XXL"}
	for _, demand := range []map[string]int{
		{"S": 30, "M": 50, "L": 40, "XL": 20, "XXL": 5},
		{"S": 1, "M": 1, "L": 1, "XL": 1, "XXL": 1},
		{"S": 0, "M": 7, "L": 0, "XL": 13, "XXL": 0},
		{"S": 200, "M": 3, "L": 199, "XL": 1, "XXL": 77},
		{"M": 1},
	} {
		for _, single := range []bool{false, true} {
			lays := planLays(sizes, demand, 40, 4, single)
			checkLays(t, sizes, demand, lays, 40, 4)
			if single {
				for _, l := range lays {
					if len(l.ratio) != 1 {
						t.Errorf("single-size mode mixed sizes: %v", l.ratio)
					}
				}
			}
		}
	}
}

// The textbook cut-order example: sizes 12, 14, 16, 18 ordered 100, 160, 120, 60,
// at most 60 plies and 4 garments to a marker. Full-height lays mean few of them.
func TestPlanLaysTextbookExample(t *testing.T) {
	sizes := []string{"12", "14", "16", "18"}
	demand := map[string]int{"12": 100, "14": 160, "16": 120, "18": 60}
	lays := planLays(sizes, demand, 60, 4, false)
	checkLays(t, sizes, demand, lays, 60, 4)
	if len(lays) > 5 {
		t.Errorf("%d lays for 440 garments is more than needed: %+v", len(lays), lays)
	}
	if lays[0].plies != 60 {
		t.Errorf("the first lay should use the full ply height, got %d", lays[0].plies)
	}
}

func TestPlanLaysIsRepeatable(t *testing.T) {
	sizes := []string{"S", "M", "L"}
	demand := map[string]int{"S": 33, "M": 61, "L": 47}
	if !reflect.DeepEqual(planLays(sizes, demand, 30, 4, false), planLays(sizes, demand, 30, 4, false)) {
		t.Error("plans differ between runs")
	}
}

func shirtOrder(t *testing.T, qty map[string]int) Sizes {
	t.Helper()
	labels := []string{"S", "M", "L", "XL"}
	base := draft.Measurements{Bust: 88, Waist: 74, BackWaistLength: 40, Shoulder: 12.5, Neck: 36, Ease: 8, SleeveLength: 58, UpperArm: 28, Wrist: 17}
	var chart []orders.OrderSize
	for i, l := range labels {
		m := base
		m.Bust += float64(i) * 4
		m.Waist += float64(i) * 4
		m.Neck += float64(i) * 1
		m.Shoulder += float64(i) * 0.6
		chart = append(chart, orders.OrderSize{Label: l, Quantity: qty[l], Measurements: m})
	}
	pieces, err := orders.GeneratePieces(orders.GarmentSchoolShirt, chart, draft.ShirtOptions{Collar: true, CollarStyle: "convertible", SleeveStyle: "half"})
	if err != nil {
		t.Fatal(err)
	}
	return Sizes{Order: labels, Demand: qty, Pieces: pieces}
}

func TestBuildPlansARealShirtOrder(t *testing.T) {
	s := shirtOrder(t, map[string]int{"S": 20, "M": 30, "L": 30, "XL": 10})
	plan := Build(s, "main", Params{FabricWidth: 150, MaxPlies: 40, ReservePercent: 3, Budget: 500 * time.Millisecond})

	if !plan.Complete || len(plan.Warnings) != 0 {
		t.Fatalf("incomplete: %v", plan.Warnings)
	}
	if plan.Garments != 90 {
		t.Errorf("garments = %d, want 90", plan.Garments)
	}
	cut := 0
	for _, l := range plan.Lays {
		cut += l.Garments
	}
	if cut != 90 {
		t.Errorf("lays cut %d garments, want 90", cut)
	}
	// A short-sleeve shirt takes roughly a metre to a metre and a half.
	if plan.PerGarmentM < 0.7 || plan.PerGarmentM > 1.6 {
		t.Errorf("%.2f m per garment is outside what a shirt takes", plan.PerGarmentM)
	}
	if plan.Efficiency < 65 || plan.Efficiency > 95 {
		t.Errorf("overall efficiency %.1f%% looks wrong", plan.Efficiency)
	}
	if plan.BuyMeters < plan.Meters*1.03 {
		t.Errorf("a 3%% reserve should be on top of what is cut: buy %.2f vs cut %.2f", plan.BuyMeters, plan.Meters)
	}
}

// Fabric that shrinks must be cut larger, so the order needs more of it.
func TestShrinkageNeedsMoreFabric(t *testing.T) {
	s := shirtOrder(t, map[string]int{"M": 20, "L": 20})
	p := Params{FabricWidth: 150, MaxPlies: 40, Budget: 300 * time.Millisecond}
	plain := Build(s, "main", p)
	p.ShrinkLength, p.ShrinkWidth = 3, 2
	shrunk := Build(s, "main", p)
	if shrunk.Meters <= plain.Meters {
		t.Errorf("3%% shrinkage should need more cloth: %.2f vs %.2f", shrunk.Meters, plain.Meters)
	}
}

func TestEndAllowanceIsCountedPerPly(t *testing.T) {
	s := shirtOrder(t, map[string]int{"M": 10})
	p := Params{FabricWidth: 150, MaxPlies: 40, Budget: 300 * time.Millisecond}
	none := Build(s, "main", p)
	p.EndAllowance = 2
	with := Build(s, "main", p)
	plies := 0
	for _, l := range with.Lays {
		plies += l.Plies
	}
	want := none.LengthCm + 2*float64(plies)
	if d := with.LengthCm - want; d > 0.01 || d < -0.01 {
		t.Errorf("length %.1f, want %.1f (%d plies x 2 cm more)", with.LengthCm, want, plies)
	}
}

func TestWeightFromGSM(t *testing.T) {
	s := shirtOrder(t, map[string]int{"M": 10})
	plan := Build(s, "main", Params{FabricWidth: 150, GSM: 200, ReservePercent: 5, Budget: 300 * time.Millisecond})
	want := plan.AreaM2 * 1.05 * 200 / 1000
	if d := plan.WeightKg - want; d > 0.02 || d < -0.02 {
		t.Errorf("weight %.2f kg, want about %.2f", plan.WeightKg, want)
	}
}

// A piece wider than the fabric is reported, and the plan says it's incomplete.
func TestFabricTooNarrowIsReported(t *testing.T) {
	s := shirtOrder(t, map[string]int{"M": 5})
	plan := Build(s, "main", Params{FabricWidth: 20, Budget: 200 * time.Millisecond})
	if plan.Complete || len(plan.Warnings) == 0 {
		t.Errorf("a 20 cm roll can't hold a shirt front, but the plan says complete=%v warnings=%v", plan.Complete, plan.Warnings)
	}
}

func TestCompareWidthsGivesAnAnswerPerWidth(t *testing.T) {
	s := shirtOrder(t, map[string]int{"M": 12, "L": 12})
	opts := CompareWidths(s, []float64{110, 150}, Params{MaxPlies: 40, Budget: 300 * time.Millisecond})
	if len(opts) != 2 || opts[0].WidthCm != 110 || opts[1].WidthCm != 150 {
		t.Fatalf("unexpected: %+v", opts)
	}
	for _, o := range opts {
		if !o.Complete || o.Meters <= 0 || o.AreaM2 <= 0 {
			t.Errorf("bad option %+v", o)
		}
	}
}

func TestFabricsListsContrastOnlyWhenUsed(t *testing.T) {
	s := shirtOrder(t, map[string]int{"M": 5})
	if got := s.Fabrics(); !reflect.DeepEqual(got, []string{"main"}) {
		t.Errorf("plain shirt fabrics = %v", got)
	}
	s.Pieces["M"] = append(s.Pieces["M"], draft.Piece{Name: "Chest band", Fabric: "contrast", PathData: "M0,0 L10,0 L10,5 L0,5 Z", Width: 10, Height: 5, Qty: 1})
	if got := s.Fabrics(); !reflect.DeepEqual(got, []string{"main", "contrast"}) {
		t.Errorf("with a motif band fabrics = %v", got)
	}
}

// One-way fabric may not turn any piece, and being restricted it can't be
// dramatically cheaper than two-way. (It can be a little cheaper: the search
// is greedy and time-limited, so more freedom doesn't guarantee a better result.)
func TestOneWayFabricNeverTurnsAPiece(t *testing.T) {
	s := shirtOrder(t, map[string]int{"M": 12, "L": 12})
	p := Params{FabricWidth: 150, MaxPlies: 40, Budget: 400 * time.Millisecond}
	two := Build(s, "main", p)
	p.OneWay = true
	one := Build(s, "main", p)
	if !one.Complete {
		t.Fatalf("incomplete: %v", one.Warnings)
	}
	if one.Meters < two.Meters*0.95 {
		t.Errorf("one-way fabric %.2f m is suspiciously far below two-way %.2f m", one.Meters, two.Meters)
	}
	for _, lay := range one.Lays {
		for _, pl := range lay.Marker.Placed {
			if pl.Rotation != 0 {
				t.Fatalf("%s was turned %d° on one-way fabric", pl.Name, pl.Rotation)
			}
		}
	}
}

func peOrder(t *testing.T, qty int) Sizes {
	t.Helper()
	m := draft.Measurements{Bust: 100, Waist: 90, BackWaistLength: 43, Shoulder: 14, Neck: 39, Ease: 10, SleeveLength: 60, UpperArm: 32, Wrist: 18}
	chart := []orders.OrderSize{{Label: "L", Quantity: qty, Measurements: m}}
	pieces, err := orders.GeneratePieces(orders.GarmentPEShirt, chart, draft.ShirtOptions{SleeveStyle: "half"})
	if err != nil {
		t.Fatal(err)
	}
	return Sizes{Order: []string{"L"}, Demand: map[string]int{"L": qty}, Pieces: pieces}
}

// Matching stripes restricts placement, so it can only cost cloth.
func TestStripesCostCloth(t *testing.T) {
	s := shirtOrder(t, map[string]int{"M": 12, "L": 12})
	p := Params{FabricWidth: 150, MaxPlies: 40, Budget: 400 * time.Millisecond}
	plain := Build(s, "main", p)
	p.StripeLength, p.StripeWidth = 4, 4
	checked := Build(s, "main", p)
	if !checked.Complete {
		t.Fatalf("incomplete: %v", checked.Warnings)
	}
	// Greedy placement means a restriction can occasionally land on a better
	// layout, so only a large saving would be wrong.
	if checked.Meters < plain.Meters*0.95 {
		t.Errorf("matched checks %.2f m came in far under plain %.2f m", checked.Meters, plain.Meters)
	}
	for _, lay := range checked.Lays {
		for _, pl := range lay.Marker.Placed {
			if pl.Rotation != 0 && !strings.Contains(pl.Name, "Placket") && pl.OrigWidth*pl.OrigHeight >= minMatchedArea {
				t.Errorf("%s turned %d° on a checked fabric", pl.Name, pl.Rotation)
			}
		}
	}
}

// On a tube every ply is two layers, so the order needs far less length than
// on open-width cloth of the same width, but about the same area.
func TestTubularKnit(t *testing.T) {
	s := peOrder(t, 40)
	p := Params{FabricWidth: 107, MaxPlies: 40, GSM: 145, Budget: 400 * time.Millisecond}
	open := Build(s, "main", p)
	p.Tubular = true
	tube := Build(s, "main", p)
	if !tube.Complete {
		t.Fatalf("incomplete: %v", tube.Warnings)
	}
	if tube.Meters > open.Meters*0.7 {
		t.Errorf("a tube (two layers) should need much less length: %.2f vs %.2f m", tube.Meters, open.Meters)
	}
	if r := tube.AreaM2 / open.AreaM2; r < 0.75 || r > 1.25 {
		t.Errorf("area should be about the same: tube %.2f m², open %.2f m²", tube.AreaM2, open.AreaM2)
	}
	// Knit suppliers quote about 5 size-L T-shirts per kilo of 30s combed
	// (145 g/m², 42" tube, Knitto). A PE shirt is a T-shirt with a sleeve a
	// little longer, so the same ballpark: 3 to 7.
	if tube.GarmentsPerKg < 3 || tube.GarmentsPerKg > 7 {
		t.Errorf("%.1f garments per kg is outside what the trade quotes (about 5)", tube.GarmentsPerKg)
	}
	t.Logf("tube: %.2f m, %.2f m², %.2f kg, %.1f per kg; open-width 107 cm: %.2f m", tube.Meters, tube.AreaM2, tube.WeightKg, tube.GarmentsPerKg, open.Meters)
}

// Efficiency counts whole garments against the cloth used, so on a tube the
// width that needs the least cloth is also the most efficient.
func TestTubeEfficiencyFollowsTheClothUsed(t *testing.T) {
	s := peOrder(t, 40)
	var best, bestEff WidthOption
	opts := CompareWidths(s, []float64{91, 97, 102, 107, 112}, Params{MaxPlies: 40, GSM: 145, Tubular: true, Budget: 300 * time.Millisecond})
	for _, o := range opts {
		if best.AreaM2 == 0 || o.AreaM2 < best.AreaM2 {
			best = o
		}
		if o.Efficiency > bestEff.Efficiency {
			bestEff = o
		}
	}
	if best.WidthCm != bestEff.WidthCm {
		t.Errorf("least cloth at %v cm but highest efficiency at %v cm: %+v", best.WidthCm, bestEff.WidthCm, opts)
	}
}

// Choosing a width per lay can only save cloth over any one width for all.
func TestWidthPerLayNeverLosesToOneWidth(t *testing.T) {
	s := peOrder(t, 40)
	s.Order = []string{"M", "L"}
	m := draft.Measurements{Bust: 88, Waist: 80, BackWaistLength: 41, Shoulder: 13, Neck: 37, Ease: 10, SleeveLength: 58, UpperArm: 29, Wrist: 17}
	extra, err := orders.GeneratePieces(orders.GarmentPEShirt, []orders.OrderSize{{Label: "M", Quantity: 30, Measurements: m}}, draft.ShirtOptions{SleeveStyle: "half"})
	if err != nil {
		t.Fatal(err)
	}
	s.Pieces["M"] = extra["M"]
	s.Demand["M"] = 30
	p := Params{MaxPlies: 40, MaxGarments: 2, SingleSizes: true, GSM: 145, Tubular: true, Budget: 300 * time.Millisecond}
	widths := []float64{97, 107, 112}
	best := math.Inf(1)
	for _, w := range widths {
		q := p
		q.FabricWidth = w
		if a := Build(s, "main", q).AreaM2; a < best {
			best = a
		}
	}
	p.FabricWidth, p.LayWidths = 107, widths
	mixed := Build(s, "main", p)
	if mixed.AreaM2 > best+0.05 {
		t.Errorf("width per lay %.2f m² is worse than the best single width %.2f m²", mixed.AreaM2, best)
	}
	total := 0.0
	for _, u := range mixed.ByWidth {
		total += u.BuyMeters
	}
	if len(mixed.ByWidth) == 0 || math.Abs(total-mixed.BuyMeters) > 0.01 {
		t.Errorf("the per-width list should add up to what is bought: %+v vs %.2f", mixed.ByWidth, mixed.BuyMeters)
	}
	for _, l := range mixed.Lays {
		if l.WidthCm != 97 && l.WidthCm != 107 && l.WidthCm != 112 {
			t.Errorf("lay on %v cm, not one of the widths offered", l.WidthCm)
		}
	}
}

func TestFabricCost(t *testing.T) {
	s := shirtOrder(t, map[string]int{"M": 10})
	perMetre := Build(s, "main", Params{FabricWidth: 150, PricePerMeter: 25000, Budget: 200 * time.Millisecond})
	if want := math.Round(perMetre.BuyMeters * 25000); perMetre.Cost != want || perMetre.CostPerGarment != math.Round(want/10) {
		t.Errorf("cost %v / %v per garment, want %v", perMetre.Cost, perMetre.CostPerGarment, want)
	}
	perKg := Build(s, "main", Params{FabricWidth: 150, GSM: 180, PricePerKg: 90000, Budget: 200 * time.Millisecond})
	if want := math.Round(perKg.WeightKg * 90000); perKg.Cost != want {
		t.Errorf("cost by weight %v, want %v", perKg.Cost, want)
	}
	if none := Build(s, "main", Params{FabricWidth: 150, Budget: 200 * time.Millisecond}); none.Cost != 0 {
		t.Errorf("no price, but cost %v", none.Cost)
	}
}

// A left/right pair is cut as two mirror images on open-width cloth.
func TestPairsAreMirrored(t *testing.T) {
	s := shirtOrder(t, map[string]int{"M": 1})
	pieces := markerPieces(s, "main", []SizeCount{{Size: "M", Count: 1}}, Params{FabricWidth: 150}, false)
	byName := map[string][]string{}
	for _, np := range pieces {
		byName[np.Name] = append(byName[np.Name], np.PathData)
	}
	fronts := byName["Shirt front (M)"]
	if len(fronts) != 2 || fronts[0] == fronts[1] {
		t.Fatalf("want the front and its mirror image, got %d outlines", len(fronts))
	}
	if a, b := nesting.PolygonArea(nesting.ParsePath(fronts[0])), nesting.PolygonArea(nesting.ParsePath(fronts[1])); math.Abs(a-b) > 1 {
		t.Errorf("mirror changed the area: %.1f vs %.1f", a, b)
	}
}

func TestBuildBestTriesOneSizePerLay(t *testing.T) {
	m := draft.Measurements{Bust: 100, Waist: 90, BackWaistLength: 43, Shoulder: 14, Neck: 39, Ease: 10, SleeveLength: 60, UpperArm: 32, Wrist: 18}
	small := m
	small.Bust, small.Waist = 84, 76
	pieces, err := orders.GeneratePieces(orders.GarmentPEShirt, []orders.OrderSize{{Label: "S", Quantity: 20, Measurements: small}, {Label: "L", Quantity: 20, Measurements: m}}, draft.ShirtOptions{SleeveStyle: "half", BackStyle: "plain"})
	if err != nil {
		t.Fatal(err)
	}
	s := Sizes{Order: []string{"S", "L"}, Demand: map[string]int{"S": 20, "L": 20}, Pieces: pieces}
	p := Params{FabricWidth: 107, MaxPlies: 40, GSM: 145, Tubular: true, LayWidths: []float64{91, 107, 112}, Budget: 300 * time.Millisecond}
	best := BuildBest(s, "main", p)
	mixed := Build(s, "main", p)
	if best.AreaM2 > mixed.AreaM2+0.01 {
		t.Errorf("BuildBest (%.2f m²) worse than mixed sizes (%.2f m²)", best.AreaM2, mixed.AreaM2)
	}
	if best.AreaM2 < mixed.AreaM2*0.99 && len(best.Notes) == 0 {
		t.Error("switched to single-size lays without saying so")
	}
	// Without per-lay widths it is just Build.
	p.LayWidths = nil
	if a, b := BuildBest(s, "main", p), Build(s, "main", p); a.AreaM2 != b.AreaM2 {
		t.Errorf("BuildBest changed a single-width plan: %.2f vs %.2f", a.AreaM2, b.AreaM2)
	}
}
