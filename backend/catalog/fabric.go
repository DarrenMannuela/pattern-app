// Package catalog holds small static reference data — right now just
// a fabric list — to support the "we suggest material" step of a
// konveksi order. It's a fixed reference list, not live pricing or
// inventory; treat it as a starting point for the conversation with
// the customer, not a quote.
package catalog

// Fabric is one reference entry: what it's made of, what it's
// commonly used for, and any notes worth mentioning to a customer.
type Fabric struct {
	Name        string `json:"name"`
	Composition string `json:"composition"`
	BestFor     string `json:"bestFor"`
	Notes       string `json:"notes"`
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
