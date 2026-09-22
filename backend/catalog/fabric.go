// Package catalog holds small static reference data — right now just
// a fabric list — to support the "we suggest material" step of a
// konveksi order. It's a fixed reference list, not live pricing or
// inventory; treat it as a starting point for the conversation with
// the customer, not a quote.
package catalog

// Fabric is one reference entry: what it's made of, what it's
// commonly used for, and any notes worth mentioning to a customer.
// Brand, ImageURL and SourceURL are only set for entries backed by a
// real supplier catalog (see fabricCatalogEntries below) — the older
// generic entries leave them blank.
type Fabric struct {
	Name        string `json:"name"`
	Composition string `json:"composition"`
	BestFor     string `json:"bestFor"`
	Notes       string `json:"notes"`
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
		Notes:       "Thicker and more structured than 30s — holds a collar and placket shape well.",
	},
	{
		Name:        "Katun Combed 30s",
		Composition: "100% cotton, combed, lighter weight",
		BestFor:     "pe_shirt",
		Notes:       "Softer and more breathable — common for daily-wear and PE shirts.",
	},
	{
		Name:        "TC (Tetoron Cotton)",
		Composition: "Polyester/cotton blend",
		BestFor:     "school_shirt",
		Notes:       "Wrinkle-resistant and cheaper than pure cotton; a common budget seragam choice.",
	},
	{
		Name:        "Drill Amerika",
		Composition: "Cotton/poly twill weave",
		BestFor:     "other",
		Notes:       "Heavy and durable — used for jackets, workwear, and PDL/almamater uniforms.",
	},
	{
		Name:        "Lacoste Pique (CVC)",
		Composition: "Cotton-viscose blend, knit pique",
		BestFor:     "pe_shirt",
		Notes:       "The standard polo-shirt knit — breathable with a bit of structure.",
	},
	{
		Name:        "Oxford",
		Composition: "100% cotton or poly-cotton, basketweave",
		BestFor:     "school_shirt",
		Notes:       "Textured, slightly heavier woven shirting — a step up from plain TC.",
	},
	{
		Name:        "Diadora / Interlock Jersey",
		Composition: "Polyester knit",
		BestFor:     "pe_shirt",
		Notes:       "Stretchy and quick-drying — common for sportswear-style PE uniforms and jerseys.",
	},
	{
		Name:        "Denim",
		Composition: "100% cotton or cotton-poly twill",
		BestFor:     "pants",
		Notes:       "Durable, structured — used for some uniform trousers/skirts.",
	},
}

// fabricCatalogEntries is the real fabric list from Sumber Agung Internusa
// (https://sumberagunginternusa.com), the konveksi's own supplier — Brand,
// ImageURL and SourceURL are real, and Composition/Notes are translated
// from each fabric's own product page. Each product page also links a
// dedicated e-catalog PDF (colour swatches etc.) at SourceURL; this list
// doesn't try to mirror those PDFs, just enough to pick a fabric by eye.
var fabricCatalogEntries = []Fabric{
	{
		Name:        "CP American Drill",
		Brand:       "Verlando",
		Composition: "65% polyester, 35% rayon",
		BestFor:     "other",
		Notes:       "Comfortable, economical, resists wrinkling. Used for big-event uniforms, factory workwear, tablecloths, curtains, seat covers.",
		ImageURL:    "/fabric-catalog/verlando-cp-american-drill.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-cp-american-drill/",
	},
	{
		Name:        "Bultop",
		Brand:       "Verlando",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "other",
		Notes:       "Ripstop, checkerboard weave — durable and classy. Used for vests, security/satpol PP uniforms, safari wear, jackets, bags, hats.",
		ImageURL:    "/fabric-catalog/verlando-bulltop.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-bulltop/",
	},
	{
		Name:        "Japan Drill",
		Brand:       "Verlando",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "uniform_shirt",
		Notes:       "Thick and soft, very durable in rough field conditions. Used for chef/cook uniforms, security, office shirts, martial arts (judo/karate), hats.",
		ImageURL:    "/fabric-catalog/verlando-japan-drill.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-japan-drill/",
	},
	{
		Name:        "Blue Jeans Series",
		Brand:       "Verlando",
		Composition: "65% polyester, 35% cotton",
		BestFor:     "other",
		Notes:       "Thick and soft, very strong against rough field conditions. Used for automotive showroom uniforms, large-scale promotional wear, outdoor activity uniforms, hats.",
		ImageURL:    "/fabric-catalog/verlando-blue-jeans-series.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-blue-jeans-series/",
	},
	{
		Name:        "Tropical Deluxe",
		Brand:       "Verlando",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "uniform_shirt",
		Notes:       "Durable, resists wrinkling, soft/cool/comfortable, absorbs sweat well — suits a tropical climate. Used for hospital, cleaning-service, office-boy, food-industry and outdoor uniforms. Many colours available.",
		ImageURL:    "/fabric-catalog/verlando-tropical.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-tropical/",
	},
	{
		Name:        "Gabardine Deluxe",
		Brand:       "Verlando",
		Composition: "100% polyester",
		BestFor:     "other",
		Notes:       "Comfortable, economical, resists wrinkling. Used for factory workwear, large-scale events, seat/cushion covers.",
		ImageURL:    "/fabric-catalog/verlando-gabardine-deluxe.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-gabardine-deluxe/",
	},
	{
		Name:        "Plat",
		Brand:       "Verlando",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "school_shirt",
		Notes:       "Durable, cool and comfortable, absorbs sweat well. Used for school uniforms, hansip (civil security) and satpam (security guard) uniforms. Many colours available.",
		ImageURL:    "/fabric-catalog/verlando-plat.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-plat/",
	},
	{
		Name:        "Basic",
		Brand:       "Verlando",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "school_shirt",
		Notes:       "Durable, cool and comfortable, well suited to a tropical climate. Used for school uniforms, light industrial workwear, catering uniforms, automotive showroom staff, promotional wear, hats. Many colours available.",
		ImageURL:    "/fabric-catalog/verlando-basic.jpg",
		SourceURL:   "https://sumberagunginternusa.com/verlando-basic/",
	},
	{
		Name:        "Tropical Deluxe",
		Brand:       "Maryland",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "uniform_shirt",
		Notes:       "Durable, breathable, moisture-wicking, cool and comfortable — suits a tropical climate. Used for hospital, cleaning-service, office-boy and food-industry uniforms, outdoor wear, tablecloths, curtains, seat covers. Many colours available.",
		ImageURL:    "/fabric-catalog/maryland-tropical.jpg",
		SourceURL:   "https://sumberagunginternusa.com/maryland-tropical/",
	},
	{
		Name:        "USA Fine Twill",
		Brand:       "Maryland",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "other",
		Notes:       "Durable, soft/cool/comfortable. Used for factory and field-worker uniforms — workshop, plantation, shipping and government-institution wear — plus tablecloths, curtains, seat/cushion covers. Many colours available.",
		ImageURL:    "/fabric-catalog/maryland-usa-fine-twill.jpg",
		SourceURL:   "https://sumberagunginternusa.com/maryland-usa-fine-twill/",
	},
	{
		Name:        "USA Drill",
		Brand:       "Ventura",
		Composition: "65% tetoron (polyester), 35% rayon",
		BestFor:     "uniform_shirt",
		Notes:       "A trusted premium brand; durable. Used for government-institution and retail uniforms, gas-station attendants, field workers, safari wear, tablecloths, curtains, seat covers.",
		ImageURL:    "/fabric-catalog/ventura-usa-drill.jpg",
		SourceURL:   "https://sumberagunginternusa.com/ventura-usa-drill/",
	},
	{
		Name:        "USA Drill",
		Brand:       "Venhouston",
		Composition: "100% polyester",
		BestFor:     "other",
		Notes:       "Comfortable, economical, resists wrinkling. Used for factory worker uniforms, large-scale events, furniture seat covers.",
		ImageURL:    "/fabric-catalog/venhouston-usa-drill.jpg",
		SourceURL:   "https://sumberagunginternusa.com/venhouston-usa-drill/",
	},
}

func init() {
	Fabrics = append(Fabrics, fabricCatalogEntries...)
}
