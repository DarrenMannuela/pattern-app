package handlers

import (
	"encoding/json"
	"net/http"

	"patternapp/backend/draft"
)

// draftRequest embeds Measurements so the JSON body can supply both
// body measurements and the dart placement in one flat object.
type draftRequest struct {
	draft.Measurements
	DartPosition string `json:"dartPosition"`
}

// Draft handles POST /api/draft — takes body measurements and returns
// the front and back bodice pieces as real curved outlines.
func Draft(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req draftRequest
	// A missing/empty body is fine — DraftBodice fills in sensible
	// defaults for any zero-valued measurement and dart position.
	if r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid measurements payload", http.StatusBadRequest)
			return
		}
	}
	writeJSON(w, http.StatusOK, draft.DraftBodice(req.Measurements, req.DartPosition))
}
