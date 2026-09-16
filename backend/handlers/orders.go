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
		writeJSON(w, http.StatusOK, a.store.List())

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

// mockupRequest is the body for POST /api/orders/{id}/mockups. Style
// and Collar only matter for orders.GarmentUniformShirt — the two
// preset shirt types ignore them and force their own combination.
type mockupRequest struct {
	Note         string            `json:"note"`
	DartPosition string            `json:"dartPosition"`
	Style        string            `json:"style"`
	Collar       bool              `json:"collar"`
	CollarStyle  string            `json:"collarStyle"`
	ChestPocket  bool              `json:"chestPocket"`
	BackPocket   bool              `json:"backPocket"`
	Embroidery   *draft.Embroidery `json:"embroidery"`
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

	opts := draft.ShirtOptions{
		DartPosition: req.DartPosition,
		Style:        req.Style,
		Collar:       req.Collar,
		CollarStyle:  req.CollarStyle,
		AddOns: draft.AddOns{
			ChestPocket: req.ChestPocket,
			BackPocket:  req.BackPocket,
			Embroidery:  req.Embroidery,
		},
	}
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
