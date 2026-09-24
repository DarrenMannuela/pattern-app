// Package catalog holds small static reference data — right now just
// a fabric list — to support the "we suggest material" step of a
// konveksi order. It's a fixed reference list, not live pricing or
// inventory; treat it as a starting point for the conversation with
// the customer, not a quote.
package catalog

// Fabric is one reference entry: what it's made of, what it's good
// for, and where it's commonly used. Brand, ImageURL and SourceURL are
// only set for entries backed by a real supplier catalog (see
// fabricCatalogEntries below) — the older generic entries leave them
// blank.
type Fabric struct {
	Name        string `json:"name"`
	Composition string `json:"composition"`
	BestFor     string `json:"bestFor"`
	// Benefits are short, scannable selling points (e.g. "Wrinkle-resistant"),
	// shown as individual chips rather than folded into one sentence.
	Benefits []string `json:"benefits"`
	// UsedFor is a plain-language sentence naming what this fabric is
	// actually cut into, in the supplier's own terms.
	UsedFor string `json:"usedFor"`
	// Brand is the supplier's brand name (e.g. "Verlando"), shown
	// alongside Name to group catalog entries in the picker.
	Brand string `json:"brand,omitempty"`
	// ImageURL is a root-relative path served by the frontend's own
	// static files (frontend/public/fabric-catalog/...), not the backend.
	ImageURL string `json:"imageUrl,omitempty"`
	// SourceURL is the supplier's own product page, for checking current
	// colours/pricing — this list is a fixed reference, not live stock.
	SourceURL string `json:"sourceUrl,omitempty"`
}

// Fabrics lists the fabrics most commonly used for Indonesian
// school/uniform work. Not exhaustive — add to this list as the
// konveksi's actual supplier catalog grows.
var Fabrics = []Fabric{
	{
		Name:        "Katun Combed 20s",
		Composition: "100% cotton, combed, heavier weight",
		BestFor:     "school_shirt",
		Benefits:    []string{"Thicker and more structured than 30s", "Holds a collar and placket shape well"},
	},
	{
		Name:        "Katun Combed 30s",
		Composition: "100% cotton, combed, lighter weight",
		BestFor:     "pe_shirt",
		Benefits:    []string{"Softer and more breathable"},
		UsedFor:     "Daily-wear and PE shirts",
	},
	{
		Name:        "TC (Tetoron Cotton)",
		Composition: "Polyester/cotton blend",
		BestFor:     "school_shirt",
		Benefits:    []string{"Wrinkle-resistant", "Cheaper than pure cotton"},
		UsedFor:     "A common budget seragam choice",
	},
	{
		Name:        "Drill Amerika",
		Composition: "Cotton/poly twill weave",
		BestFor:     "other",
		Benefits:    []string{"Heavy and durable"},
		UsedFor:     "Jackets, workwear, PDL/almamater uniforms",
	},
	{
		Name:        "Lacoste Pique (CVC)",
		Composition: "Cotton-viscose blend, knit pique",
		BestFor:     "pe_shirt",
		Benefits:    []string{"Breathable with a bit of structure"},
		UsedFor:     "The standard polo-shirt knit",
	},
	{
		Name:        "Oxford",
		Composition: "100% cotton or poly-cotton, basketweave",
		BestFor:     "school_shirt",
		Benefits:    []string{"Textured", "Slightly heavier woven shirting"},
		UsedFor:     "A step up from plain TC",
	},
	{
		Name:        "Diadora / Interlock Jersey",
		Composition: "Polyester knit",
		BestFor:     "pe_shirt",
		Benefits:    []string{"Stretchy", "Quick-drying"},
		UsedFor:     "Sportswear-style PE uniforms and jerseys",
	},
	{
		Name:        "Denim",
		Composition: "100% cotton or cotton-poly twill",
		BestFor:     "pants",
		Benefits:    []string{"Durable", "Structured"},
		UsedFor:     "Some uniform trousers/skirts",
	},
}

// fabricCatalogEntries is the real fabric list from Sumber Agung Internusa
// (https://sumberagunginternusa.com), the konveksi's own supplier — Brand,
// ImageURL and SourceURL are real, and Composition/Benefits/UsedFor are
// translated from each fabric's own product page. Each product page also
// links a dedicated e-catalog PDF (colour swatches etc.) at SourceURL; this
// list doesn't try to mirror those PDFs, just enough to pick a fabric by eye.
var fabricCatalogEntries = []Fabric{
	{
		Name:        "CP American Drill",
		Brand:       "Verlando",
		Composition: "65% polyester, 35% rayon",
		BestFor:     "other",
		Benefits:    []string{"Comfortable", "Economical", "Resists wrinkling"},
		UsedFor:     "Big-event uniforms, factory workwear, tablecloths, curtains, seat covers",
		ImageURL:    "/fabric-catalog/verlando-cp-american-drill.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-cp-american-drill/",
	},
	{
		Name:        "Bultop",
		Brand:       "Verlando",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "other",
		Benefits:    []string{"Ripstop, checkerboard weave", "Durable and classy"},
		UsedFor:     "Vests, security/satpol PP uniforms, safari wear, jackets, bags, hats",
		ImageURL:    "/fabric-catalog/verlando-bulltop.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-bulltop/",
	},
	{
		Name:        "Japan Drill",
		Brand:       "Verlando",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "uniform_shirt",
		Benefits:    []string{"Thick and soft", "Very durable in rough field conditions"},
		UsedFor:     "Chef/cook uniforms, security, office shirts, martial arts (judo/karate), hats",
		ImageURL:    "/fabric-catalog/verlando-japan-drill.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-japan-drill/",
	},
	{
		Name:        "Blue Jeans Series",
		Brand:       "Verlando",
		Composition: "65% polyester, 35% cotton",
		BestFor:     "other",
		Benefits:    []string{"Thick and soft", "Very strong against rough field conditions"},
		UsedFor:     "Automotive showroom uniforms, large-scale promotional wear, outdoor activity uniforms, hats",
		ImageURL:    "/fabric-catalog/verlando-blue-jeans-series.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-blue-jeans-series/",
	},
	{
		Name:        "Tropical Deluxe",
		Brand:       "Verlando",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "uniform_shirt",
		Benefits:    []string{"Durable", "Resists wrinkling", "Soft, cool and comfortable", "Absorbs sweat well", "Suits a tropical climate", "Many colours available"},
		UsedFor:     "Hospital, cleaning-service, office-boy, food-industry and outdoor uniforms",
		ImageURL:    "/fabric-catalog/verlando-tropical.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-tropical/",
	},
	{
		Name:        "Gabardine Deluxe",
		Brand:       "Verlando",
		Composition: "100% polyester",
		BestFor:     "other",
		Benefits:    []string{"Comfortable", "Economical", "Resists wrinkling"},
		UsedFor:     "Factory workwear, large-scale events, seat/cushion covers",
		ImageURL:    "/fabric-catalog/verlando-gabardine-deluxe.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-gabardine-deluxe/",
	},
	{
		Name:        "Plat",
		Brand:       "Verlando",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "school_shirt",
		Benefits:    []string{"Durable", "Cool and comfortable", "Absorbs sweat well", "Many colours available"},
		UsedFor:     "School uniforms, hansip (civil security) and satpam (security guard) uniforms",
		ImageURL:    "/fabric-catalog/verlando-plat.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-plat/",
	},
	{
		Name:        "Basic",
		Brand:       "Verlando",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "school_shirt",
		Benefits:    []string{"Durable", "Cool and comfortable", "Well suited to a tropical climate", "Many colours available"},
		UsedFor:     "School uniforms, light industrial workwear, catering uniforms, automotive showroom staff, promotional wear, hats",
		ImageURL:    "/fabric-catalog/verlando-basic.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-basic/",
	},
	{
		Name:        "Tropical Deluxe",
		Brand:       "Maryland",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "uniform_shirt",
		Benefits:    []string{"Durable", "Breathable", "Moisture-wicking", "Cool and comfortable", "Suits a tropical climate", "Many colours available"},
		UsedFor:     "Hospital, cleaning-service, office-boy and food-industry uniforms, outdoor wear, tablecloths, curtains, seat covers",
		ImageURL:    "/fabric-catalog/maryland-tropical.jpg",
		SourceURL:   "https://sumberagunginternusa.com/maryland-tropical/",
	},
	{
		Name:        "USA Fine Twill",
		Brand:       "Maryland",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "other",
		Benefits:    []string{"Durable", "Soft, cool and comfortable", "Many colours available"},
		UsedFor:     "Factory and field-worker uniforms (workshop, plantation, shipping, government institutions), tablecloths, curtains, seat/cushion covers",
		ImageURL:    "/fabric-catalog/maryland-usa-fine-twill.jpg",
		SourceURL:   "https://sumberagunginternusa.com/maryland-usa-fine-twill/",
	},
	{
		Name:        "USA Drill",
		Brand:       "Ventura",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "uniform_shirt",
		Benefits:    []string{"Trusted premium brand", "Durable"},
		UsedFor:     "Government-institution and retail uniforms, gas-station attendants, field workers, safari wear, tablecloths, curtains, seat covers",
		ImageURL:    "/fabric-catalog/ventura-usa-drill.jpg",
		SourceURL:   "https://sumberagunginternusa.com/ventura-usa-drill/",
	},
	{
		Name:        "USA Drill",
		Brand:       "Venhouston",
		Composition: "100% polyester",
		BestFor:     "other",
		Benefits:    []string{"Comfortable", "Economical", "Resists wrinkling"},
		UsedFor:     "Factory worker uniforms, large-scale events, furniture seat covers",
		ImageURL:    "/fabric-catalog/venhouston-usa-drill.jpg",
		SourceURL:   "https://sumberagunginternusa.com/venhouston-usa-drill/",
	},
}

func init() {
	Fabrics = append(Fabrics, fabricCatalogEntries...)
}
