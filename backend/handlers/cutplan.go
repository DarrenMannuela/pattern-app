package handlers

import (
	"fmt"
	"net/http"
	"time"

	"patternapp/backend/cutplan"
	"patternapp/backend/orders"
)

// cuttingPlanRequest is the body for POST /api/orders/{id}/cutting-plan.
// Anything left out takes the usual value.
type cuttingPlanRequest struct {
	Version        int       `json:"version"` // 0 = the latest revision
	FabricWidth    float64   `json:"fabricWidth"`
	ContrastWidth  float64   `json:"contrastWidth"`
	MaxPlies       int       `json:"maxPlies"`
	MaxGarments    int       `json:"maxGarments"`
	SingleSizes    bool      `json:"singleSizes"`
	OneWay         bool      `json:"oneWay"`
	StripeLength   float64   `json:"stripeLength"`
	StripeWidth    float64   `json:"stripeWidth"`
	Tubular        bool      `json:"tubular"`
	LayWidths      []float64 `json:"layWidths"`
	PricePerMeter  float64   `json:"pricePerMeter"`
	PricePerKg     float64   `json:"pricePerKg"`
	EndAllowance   *float64  `json:"endAllowance"`
	Spacing        float64   `json:"spacing"`
	ShrinkLength   float64   `json:"shrinkLength"`
	ShrinkWidth    float64   `json:"shrinkWidth"`
	ReservePercent *float64  `json:"reservePercent"`
	GSM            float64   `json:"gsm"`
	CompareWidths  []float64 `json:"compareWidths"`
}

type cuttingPlanResponse struct {
	Version int                   `json:"version"`
	Sizes   []cutplan.SizeCount   `json:"sizes"`
	Plans   []cutplan.Plan        `json:"plans"`
	Widths  []cutplan.WidthOption `json:"widths,omitempty"`
}

func validateCuttingPlan(r *cuttingPlanRequest) string {
	inRange := func(name string, v, lo, hi float64) string {
		if v < lo || v > hi {
			return fmt.Sprintf("%s must be between %g and %g", name, lo, hi)
		}
		return ""
	}
	if r.FabricWidth == 0 {
		r.FabricWidth = 150
	}
	if r.ContrastWidth == 0 {
		r.ContrastWidth = r.FabricWidth
	}
	for _, msg := range []string{
		inRange("fabricWidth", r.FabricWidth, 20, maxFabricWidthCm),
		inRange("contrastWidth", r.ContrastWidth, 20, maxFabricWidthCm),
		inRange("maxPlies", float64(r.MaxPlies), 0, 300),
		inRange("maxGarments", float64(r.MaxGarments), 0, 12),
		inRange("spacing", r.Spacing, 0, 5),
		inRange("shrinkLength", r.ShrinkLength, 0, 15),
		inRange("shrinkWidth", r.ShrinkWidth, 0, 15),
		inRange("gsm", r.GSM, 0, 1000),
		inRange("stripeLength", r.StripeLength, 0, 100),
		inRange("stripeWidth", r.StripeWidth, 0, 100),
		inRange("pricePerMeter", r.PricePerMeter, 0, 1e7),
		inRange("pricePerKg", r.PricePerKg, 0, 1e7),
	} {
		if msg != "" {
			return msg
		}
	}
	if r.EndAllowance != nil {
		if msg := inRange("endAllowance", *r.EndAllowance, 0, 20); msg != "" {
			return msg
		}
	}
	if r.ReservePercent != nil {
		if msg := inRange("reservePercent", *r.ReservePercent, 0, 30); msg != "" {
			return msg
		}
	}
	if len(r.LayWidths) > 8 {
		return "layWidths can list at most 8 widths"
	}
	for _, w := range r.LayWidths {
		if msg := inRange("layWidths", w, 20, maxFabricWidthCm); msg != "" {
			return msg
		}
	}
	if len(r.CompareWidths) > 8 {
		return "compareWidths can list at most 8 widths"
	}
	for _, w := range r.CompareWidths {
		if msg := inRange("compareWidths", w, 20, maxFabricWidthCm); msg != "" {
			return msg
		}
	}
	return ""
}

func (r cuttingPlanRequest) params() cutplan.Params {
	p := cutplan.Params{
		FabricWidth:    r.FabricWidth,
		MaxPlies:       r.MaxPlies,
		MaxGarments:    r.MaxGarments,
		SingleSizes:    r.SingleSizes,
		OneWay:         r.OneWay,
		StripeLength:   r.StripeLength,
		StripeWidth:    r.StripeWidth,
		Tubular:        r.Tubular,
		PricePerMeter:  r.PricePerMeter,
		PricePerKg:     r.PricePerKg,
		EndAllowance:   2,
		Spacing:        r.Spacing,
		ShrinkLength:   r.ShrinkLength,
		ShrinkWidth:    r.ShrinkWidth,
		ReservePercent: 3,
		GSM:            r.GSM,
		Budget:         2 * time.Second,
	}
	if r.EndAllowance != nil {
		p.EndAllowance = *r.EndAllowance
	}
	if r.ReservePercent != nil {
		p.ReservePercent = *r.ReservePercent
	}
	return p
}

// CuttingPlan handles POST /api/orders/{id}/cutting-plan — how the order would
// be cut: the lays (a size ratio and a number of plies each), the marker for
// each, the fabric it takes, and optionally how that changes with fabric width.
func (a *OrdersAPI) CuttingPlan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	o, ok := a.store.Get(r.PathValue("id"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	var req cuttingPlanRequest
	if r.ContentLength != 0 {
		if !readJSON(w, r, &req, maxBodyBytes, "cutting plan request") {
			return
		}
	}
	if msg := validateCuttingPlan(&req); msg != "" {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}
	version := req.Version
	if version == 0 {
		version = len(o.Mockups)
	}
	if version == 0 {
		http.Error(w, "generate a mockup first: the cutting plan is worked out from its pieces", http.StatusUnprocessableEntity)
		return
	}
	mockup, pieces, err, found := orders.MockupPieces(o, version)
	if !found {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}

	sizes := cutplan.Sizes{Demand: map[string]int{}, Pieces: pieces}
	var counts []cutplan.SizeCount
	for _, sz := range mockup.Sizes {
		if _, seen := sizes.Demand[sz.Label]; !seen {
			sizes.Order = append(sizes.Order, sz.Label)
		}
		sizes.Demand[sz.Label] += sz.Quantity
	}
	total := 0
	for _, label := range sizes.Order {
		total += sizes.Demand[label]
		counts = append(counts, cutplan.SizeCount{Size: label, Count: sizes.Demand[label]})
	}
	if total == 0 {
		http.Error(w, "add the number of garments for each size in the size chart to plan the cutting", http.StatusUnprocessableEntity)
		return
	}

	params := req.params()
	resp := cuttingPlanResponse{Version: version, Sizes: counts}
	for _, fabric := range sizes.Fabrics() {
		p := params
		if fabric == "main" {
			p.LayWidths = req.LayWidths
		} else {
			// The contrast fabric is bought separately, on its own width and price.
			p.FabricWidth = req.ContrastWidth
			p.PricePerMeter, p.PricePerKg = 0, 0
		}
		resp.Plans = append(resp.Plans, cutplan.BuildBest(sizes, fabric, p))
	}
	if len(req.CompareWidths) > 0 {
		cp := params
		cp.Budget = time.Second
		resp.Widths = cutplan.CompareWidths(sizes, req.CompareWidths, cp)
	}
	writeJSON(w, http.StatusOK, resp)
}
