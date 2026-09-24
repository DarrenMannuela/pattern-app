package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"patternapp/backend/catalog"
	"patternapp/backend/draft"
	"patternapp/backend/orders"
)

// OrdersAPI wraps an orders.Store with HTTP handlers. Kept separate
// from Store (the cutting-layout piece list) since they're unrelated
// resources that just happen to live in the same backend.
type OrdersAPI struct {
	store *orders.Store
}

func NewOrdersAPI(path string) (*OrdersAPI, error) {
	store, err := orders.NewStore(path)
	if err != nil {
		return nil, err
	}
	return &OrdersAPI{store: store}, nil
}

// List handles GET /api/orders and POST /api/orders.
func (a *OrdersAPI) List(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// The list doesn't need each order's (large) design picture.
		list := a.store.List()
		slim := make([]orders.Order, len(list))
		for i, o := range list {
			slim[i] = *o
			slim[i].DesignImage = ""
		}
		writeJSON(w, http.StatusOK, slim)

	case http.MethodPost:
		var o orders.Order
		if !readJSON(w, r, &o, maxOrderBodyBytes, "order payload") {
			return
		}
		if msg := validateOrder(&o); msg != "" {
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
		created, err := a.store.Create(&o)
		if err != nil {
			http.Error(w, "failed to save order: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, created)

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// validOrderStatuses are the stages an order moves through.
var validOrderStatuses = map[string]bool{"consultation": true, "mockup": true, "revision": true, "approved": true}

// validateOrder returns what is wrong with an order sent to create or replace
// one, or "". A replace carries the whole order, so a payload missing its name
// or garment would blank them.
func validateOrder(o *orders.Order) string {
	if strings.TrimSpace(o.CustomerName) == "" || o.GarmentType == "" {
		return "customerName and garmentType are required"
	}
	if o.Status != "" && !validOrderStatuses[o.Status] {
		return "status must be one of consultation, mockup, revision, approved"
	}
	if a := o.ActualFabric; a != nil {
		if a.Meters < 0 || a.Meters > 100000 || a.Kg < 0 || a.Kg > 100000 || a.WidthCm < 0 || a.WidthCm > maxFabricWidthCm || len(a.Note) > 2000 {
			return "the fabric actually used is out of range"
		}
	}
	return checkSizes(o.Sizes)
}

// validateMockupRequest returns what is wrong with the options and sizes sent
// to draft a preview or a revision, or "".
func validateMockupRequest(req *mockupRequest) string {
	if msg := checkSizes(req.Sizes); msg != "" {
		return msg
	}
	return checkNumbers(req)
}

// ByID handles GET/PUT/DELETE /api/orders/{id}.
func (a *OrdersAPI) ByID(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	switch r.Method {
	case http.MethodGet:
		o, ok := a.store.Get(id)
		if !ok {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, http.StatusOK, o)

	case http.MethodPut:
		var patch orders.Order
		if !readJSON(w, r, &patch, maxOrderBodyBytes, "order payload") {
			return
		}
		if msg := validateOrder(&patch); msg != "" {
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
		updated, err, ok := a.store.Update(id, &patch)
		if !ok {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "failed to save order: "+err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, updated)

	case http.MethodDelete:
		found, err := a.store.Delete(id)
		if !found {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, "failed to delete order: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// mockupRequest is the body for POST /api/orders/{id}/mockups. Collar
// only matters for orders.GarmentUniformShirt — the two preset shirt
// types ignore it and force their own combination; Gender,
// DartPosition, and SleeveStyle apply to every shirt type.
type mockupRequest struct {
	Note         string               `json:"note"`
	Gender       string               `json:"gender"`
	DartPosition string               `json:"dartPosition"`
	SleeveStyle  string               `json:"sleeveStyle"`
	Collar       bool                 `json:"collar"`
	CollarStyle  string               `json:"collarStyle"`
	FrontStyle   string               `json:"frontStyle"`
	BackStyle    string               `json:"backStyle"`
	HemStyle     string               `json:"hemStyle"`
	Neckline     string               `json:"neckline"`
	Trim         string               `json:"trim"`
	Panel        string               `json:"panel"`
	SleeveFabric string               `json:"sleeveFabric"`
	ColorBlock   string               `json:"colorBlock"`
	Motifs       []string             `json:"motifs"`
	Pattern      string               `json:"pattern"`
	Trousers     draft.TrouserOptions `json:"trousers"`
	Merch        draft.MerchOptions   `json:"merch"`
	Skirt        draft.SkirtOptions   `json:"skirt"`
	Custom       draft.CustomOptions  `json:"custom"`
	Accessories  []draft.Accessory    `json:"accessories"`
	// Sizes overrides the saved size chart for a live preview only, and
	// GarmentType the order's garment (so the pattern maker can draw a
	// collared shirt for a part thumbnail on any shirt order).
	Sizes       []orders.OrderSize `json:"sizes"`
	GarmentType string             `json:"garmentType"`
}

func (req mockupRequest) options() draft.ShirtOptions {
	return draft.ShirtOptions{
		Gender:       req.Gender,
		DartPosition: req.DartPosition,
		SleeveStyle:  req.SleeveStyle,
		Collar:       req.Collar,
		CollarStyle:  req.CollarStyle,
		FrontStyle:   req.FrontStyle,
		BackStyle:    req.BackStyle,
		HemStyle:     req.HemStyle,
		Neckline:     req.Neckline,
		Trim:         req.Trim,
		Panel:        req.Panel,
		SleeveFabric: req.SleeveFabric,
		ColorBlock:   req.ColorBlock,
		Motifs:       req.Motifs,
		Pattern:      req.Pattern,
		Trousers:     req.Trousers,
		Merch:        req.Merch,
		Skirt:        req.Skirt,
		Custom:       req.Custom,
		AddOns:       draft.AddOns{Accessories: req.Accessories},
	}
}

// Preview handles POST /api/orders/{id}/preview — drafts the pieces for a
// set of options without saving a revision, so the pattern maker can
// redraw as parts are dropped on the garment. Sizes in the body (the
// unsaved size chart) win over the saved ones.
func (a *OrdersAPI) Preview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	o, ok := a.store.Get(r.PathValue("id"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	var req mockupRequest
	if r.ContentLength != 0 {
		if !readJSON(w, r, &req, maxOrderBodyBytes, "preview payload") {
			return
		}
		if msg := validateMockupRequest(&req); msg != "" {
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
	}
	sizes := o.Sizes
	if len(req.Sizes) > 0 {
		sizes = req.Sizes
	}
	garment := o.GarmentType
	if req.GarmentType != "" {
		garment = req.GarmentType
	}
	pieces, err := orders.GeneratePieces(garment, sizes, req.options())
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"pieces": pieces})
}

// CreateMockup handles POST /api/orders/{id}/mockups.
func (a *OrdersAPI) CreateMockup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id := r.PathValue("id")
	var req mockupRequest
	if r.ContentLength != 0 {
		if !readJSON(w, r, &req, maxOrderBodyBytes, "mockup payload") {
			return
		}
		if msg := validateMockupRequest(&req); msg != "" {
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
	}

	opts := req.options()
	updated, pieces, err, ok := a.store.AddMockup(id, req.Note, opts)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"order":  updated,
		"mockup": updated.Mockups[len(updated.Mockups)-1],
		"pieces": pieces,
	})
}

// MockupByVersion handles GET /api/orders/{id}/mockups/{version} —
// regenerates a past revision's pieces from its own snapshot.
func (a *OrdersAPI) MockupByVersion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id := r.PathValue("id")
	version, err := strconv.Atoi(r.PathValue("version"))
	if err != nil {
		http.Error(w, "invalid version", http.StatusBadRequest)
		return
	}
	o, ok := a.store.Get(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	mockup, pieces, genErr, ok := orders.MockupPieces(o, version)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if genErr != nil {
		http.Error(w, genErr.Error(), http.StatusUnprocessableEntity)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"mockup": mockup,
		"pieces": pieces,
	})
}

// Fabrics handles GET /api/fabrics.
func Fabrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, catalog.Fabrics)
}
