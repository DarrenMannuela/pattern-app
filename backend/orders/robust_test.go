package orders

import (
	"fmt"
	"math"
	"math/rand"
	"os"
	"regexp"
	"strconv"
	"testing"

	"patternapp/backend/draft"
)

// A konveksi takes any order that walks in, so the drafting must hold up for
// any plausible size and option, not just the charts it was tuned on. This
// drafts every garment type across a few hundred random sizes, from small
// children to large adults, with blank measurements too, and checks every
// piece comes out whole: no crash, no NaN or runaway number, a closed
// outline of real size.

var pathNumber = regexp.MustCompile(`-?\d*\.?\d+(e[-+]?\d+)?|NaN|Inf`)

func checkPieces(t *testing.T, label string, pieces map[string][]draft.Piece) {
	t.Helper()
	for size, ps := range pieces {
		if len(ps) == 0 {
			t.Errorf("%s size %s: no pieces", label, size)
		}
		for _, p := range ps {
			where := fmt.Sprintf("%s size %s, %q", label, size, p.Name)
			if math.IsNaN(p.Width) || math.IsNaN(p.Height) || p.Width <= 0 || p.Height <= 0 || p.Width > 400 || p.Height > 400 {
				t.Errorf("%s: size %.1f x %.1f", where, p.Width, p.Height)
			}
			if p.PathData == "" || p.PathData[0] != 'M' {
				t.Errorf("%s: no outline", where)
				continue
			}
			for _, d := range []string{p.PathData, p.CutPathData} {
				for _, tok := range pathNumber.FindAllString(d, -1) {
					v, err := strconv.ParseFloat(tok, 64)
					if err != nil || math.IsNaN(v) || math.IsInf(v, 0) || math.Abs(v) > 1000 {
						t.Errorf("%s: bad number %q in its outline", where, tok)
						break
					}
				}
			}
		}
	}
}

func between(r *rand.Rand, lo, hi float64) float64 { return math.Round((lo+r.Float64()*(hi-lo))*2) / 2 }

// randomBody is a body from a small child to a large adult, its
// measurements in proportion, with now and then a measurement left blank.
func randomBody(r *rand.Rand) draft.Measurements {
	k := r.Float64() // 0 = small child, 1 = large adult
	m := draft.Measurements{
		Bust:            between(r, 52+k*60, 60+k*70),
		Waist:           between(r, 48+k*45, 56+k*60),
		Hip:             between(r, 56+k*55, 62+k*70),
		BackWaistLength: between(r, 22+k*18, 26+k*22),
		Shoulder:        between(r, 7+k*6, 9+k*9),
		Neck:            between(r, 26+k*10, 29+k*18),
		Ease:            between(r, 0, 12),
		SleeveLength:    between(r, 30+k*25, 36+k*32),
		UpperArm:        between(r, 17+k*12, 20+k*20),
		Wrist:           between(r, 11+k*5, 13+k*8),
		Rise:            between(r, 16+k*9, 19+k*13),
		Inseam:          between(r, 30+k*40, 40+k*50),
		SkirtLength:     between(r, 25+k*35, 35+k*45),
	}
	if r.Intn(4) == 0 {
		m.SleeveLength = between(r, 12, 28) // a short sleeve given as itself
	}
	// Blank a few measurements: the drafts fill them in.
	for i := r.Intn(3); i > 0; i-- {
		switch r.Intn(6) {
		case 0:
			m.Hip = 0
		case 1:
			m.Neck = 0
		case 2:
			m.UpperArm = 0
		case 3:
			m.Wrist = 0
		case 4:
			m.Ease = 0
		case 5:
			m.Shoulder = 0
		}
	}
	return m
}

func pick(r *rand.Rand, opts ...string) string { return opts[r.Intn(len(opts))] }

func randomShirt(r *rand.Rand) draft.ShirtOptions {
	o := draft.ShirtOptions{
		Gender:        pick(r, "unisex", "male", "female"),
		Fit:           pick(r, "", "regular", "loose"),
		SleeveStyle:   pick(r, "half", "three_quarter", "full"),
		SleevePlacket: pick(r, "", "bound"),
		SleeveFabric:  pick(r, "main", "contrast"),
		Collar:        r.Intn(2) == 0,
		CollarStyle:   pick(r, "convertible", "standing", "peter_pan", "spread"),
		FrontStyle:    pick(r, "placket", "hidden_placket", "plain"),
		BackStyle:     pick(r, "yoke", "plain", "yoke_pleat"),
		HemStyle:      pick(r, "curved", "straight"),
		Neckline:      pick(r, "round", "v_neck"),
		Trim:          pick(r, "none", "contrast"),
		DartPosition:  pick(r, "waist", "side", "shoulder", "armhole", "neckline"),
		ColorBlock:    pick(r, "", "straight", "v"),
		Pattern:       "solid",
	}
	if r.Intn(3) == 0 {
		// The shop's uniform block, sometimes re-anchored to another size.
		o.Block = draft.BlockKonveksi
		if r.Intn(2) == 0 {
			o.Konveksi = draft.KonveksiOptions{BaseSize: pick(r, "S", "M", "L", "XL", "nonsense"), Chest: between(r, 70, 140), Length: between(r, 55, 90)}
		}
	}
	if r.Intn(3) == 0 {
		o.Motifs = []string{pick(r, "centre", "double", "chest", "shoulder", "hem", "arms")}
	}
	if r.Intn(3) == 0 {
		o.AddOns.Accessories = []draft.Accessory{
			{ID: "p", Type: "pocket", Segment: pick(r, "left_chest", "right_chest", "left_sleeve"), Shape: pick(r, "classic", "pointed", "rounded")},
			{ID: "e", Type: "embroidery", Segment: "back", Width: 8, Height: 6},
		}
	}
	return o
}

// SWEEP_N and SWEEP_SEED run a longer or different sweep, e.g.
// SWEEP_N=5000 SWEEP_SEED=7 go test -run DraftingHoldsUp ./orders/
func TestDraftingHoldsUpForAnyOrder(t *testing.T) {
	n, seed := 250, int64(20261005)
	if v, err := strconv.Atoi(os.Getenv("SWEEP_N")); err == nil && v > 0 {
		n = v
	}
	if v, err := strconv.ParseInt(os.Getenv("SWEEP_SEED"), 10, 64); err == nil {
		seed = v
	}
	r := rand.New(rand.NewSource(seed))
	shirts := []string{GarmentSchoolShirt, GarmentPolo, GarmentPEShirt, GarmentUniformShirt}
	merch := []string{"tote_bag", "drawstring_bag", "pouch", "apron", "bucket_hat", "headband", "patch", "lanyard", "banner"}
	for i := 0; i < n; i++ {
		sizes := []OrderSize{{Label: pick(r, "A", "S", "M", "XL", "5XL"), Quantity: 1, Measurements: randomBody(r)}, {Label: "B", Quantity: 3, Measurements: randomBody(r)}}
		var garment string
		var opts draft.ShirtOptions
		switch i % 4 {
		case 0, 1:
			garment = shirts[r.Intn(len(shirts))]
			opts = randomShirt(r)
		case 2:
			garment = pick(r, GarmentPants, GarmentShorts, GarmentSkirt)
			opts.Trousers = draft.TrouserOptions{LegStyle: pick(r, "straight", "tapered", "wide"), FrontPocket: pick(r, "slant", "none"), BackPocket: pick(r, "welt", "patch", "none"), BeltLoops: pick(r, "loops", "none"), Fly: pick(r, "fly", "plain"), Waist: pick(r, "band", "elastic"), Stripe: pick(r, "none", "side")}
			opts.Skirt = draft.SkirtOptions{Style: pick(r, "a_line", "straight", "pleated", "flared"), Waist: pick(r, "band", "elastic"), Pocket: pick(r, "none", "side")}
		case 3:
			garment = GarmentOther
			opts.Merch = draft.MerchOptions{Item: merch[r.Intn(len(merch))], Size: pick(r, "small", "medium", "large")}
			if r.Intn(3) == 0 {
				opts.Merch.Width, opts.Merch.Height = between(r, 5, 60), between(r, 5, 60)
			}
		}
		label := fmt.Sprintf("#%d %s %+v", i, garment, sizes[0].Measurements)
		func() {
			defer func() {
				if p := recover(); p != nil {
					t.Fatalf("%s: drafting crashed: %v", label, p)
				}
			}()
			pieces, err := GeneratePieces(garment, sizes, opts)
			if err != nil {
				t.Errorf("%s: %v", label, err)
				return
			}
			checkPieces(t, label, pieces)
			_ = Summaries(sizes, pieces) // must not crash either
		}()
		if t.Failed() {
			return // the first few failures say enough
		}
	}
}
