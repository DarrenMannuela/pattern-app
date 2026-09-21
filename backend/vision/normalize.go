package vision

import "strings"

// enumValues returns the allowed values of each enum property of Design.
func enumValues() map[string]map[string]bool {
	out := map[string]map[string]bool{}
	for k, v := range Schema()["properties"].(map[string]any) {
		e, ok := v.(map[string]any)["enum"].([]any)
		if !ok {
			continue
		}
		set := map[string]bool{}
		for _, x := range e {
			set[x.(string)] = true
		}
		out[k] = set
	}
	return out
}

var motifChoices = map[string]bool{"centre_streak": true, "double_streak": true, "chest_band": true, "shoulder_band": true, "hem_band": true, "arm_bands": true}

// Normalize makes a design safe to use whoever read it: a value outside the
// catalog becomes the neutral one ("not_applicable" or "none"), pockets and
// prints that name an unknown place are dropped, and colours are #rrggbb.
// Smaller local models need this; the Claude API's structured output already
// guarantees it.
func (d *Design) Normalize() {
	enums := enumValues()
	fix := func(field string, v *string, fallback string) {
		*v = strings.TrimSpace(strings.ToLower(*v))
		if !enums[field][*v] {
			*v = fallback
		}
	}
	fix("garment", &d.Garment, "other")
	fix("fit", &d.Fit, "unisex")
	fix("sleeve", &d.Sleeve, "not_applicable")
	fix("neckline", &d.Neckline, "not_applicable")
	fix("front", &d.Front, "not_applicable")
	fix("back", &d.Back, "not_applicable")
	fix("hem", &d.Hem, "not_applicable")
	fix("trim", &d.Trim, "none")
	fix("insert_panel", &d.InsertPanel, "none")
	fix("leg", &d.Leg, "not_applicable")
	fix("front_pocket", &d.FrontPocket, "not_applicable")
	fix("back_pocket", &d.BackPocket, "not_applicable")
	fix("waist", &d.Waist, "not_applicable")
	fix("side_stripe", &d.SideStripe, "none")
	fix("skirt_style", &d.SkirtStyle, "not_applicable")
	fix("pattern", &d.Pattern, "solid")
	fix("confidence", &d.Confidence, "low")

	segs := map[string]bool{}
	for _, s := range segments {
		segs[s] = true
	}
	pockets := d.Pockets[:0]
	for _, p := range d.Pockets {
		if segs[p.Segment] && (p.Kind == "patch" || p.Kind == "pen" || p.Kind == "welt") {
			pockets = append(pockets, p)
		}
	}
	d.Pockets = pockets
	prints := d.Prints[:0]
	for _, p := range d.Prints {
		if segs[p.Segment] && (p.Type == "embroidery" || p.Type == "sablon") {
			prints = append(prints, p)
		}
	}
	d.Prints = prints
	motifs := []string{}
	for _, m := range d.Motifs {
		m = strings.TrimSpace(strings.ToLower(m))
		if motifChoices[m] {
			motifs = append(motifs, m)
		}
	}
	d.Motifs = motifs
	if d.Pockets == nil {
		d.Pockets = []PocketRead{}
	}
	if d.Prints == nil {
		d.Prints = []PrintRead{}
	}
	if d.Unsupported == nil {
		d.Unsupported = []string{}
	}
	d.MainColor = hexColor(d.MainColor)
	d.AccentColor = hexColor(d.AccentColor)
}

// hexColor returns c as "#rrggbb", or "" if it isn't one.
func hexColor(c string) string {
	c = strings.ToLower(strings.TrimSpace(c))
	if len(c) == 6 {
		c = "#" + c
	}
	if len(c) != 7 || c[0] != '#' {
		return ""
	}
	for _, r := range c[1:] {
		if !(r >= '0' && r <= '9' || r >= 'a' && r <= 'f') {
			return ""
		}
	}
	return c
}
