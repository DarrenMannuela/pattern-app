package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

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

func NewOrdersAPI(path string) *OrdersAPI {
	return &OrdersAPI{store: orders.NewStore(path)}
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
		if err := json.NewDecoder(r.Body).Decode(&o); err != nil {
			http.Error(w, "invalid order payload", http.StatusBadRequest)
			return
		}
		if o.CustomerName == "" || o.GarmentType == "" {
			http.Error(w, "customerName and garmentType are required", http.StatusBadRequest)
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
		if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
			http.Error(w, "invalid order payload", http.StatusBadRequest)
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
		if !a.store.Delete(id) {
			http.NotFound(w, r)
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid preview payload", http.StatusBadRequest)
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid mockup payload", http.StatusBadRequest)
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
