package handlers

import (
	"encoding/json"
	"net/http"

	"patternapp/backend/draft"
)

// Draft handles POST /api/draft — takes body measurements and returns
// the front and back bodice pieces as real curved outlines.
func Draft(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var m draft.Measurements
	// A missing/empty body is fine — DraftBodice fills in sensible
	// defaults for any zero-valued measurement.
	if r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
			http.Error(w, "invalid measurements payload", http.StatusBadRequest)
			return
		}
	}
	writeJSON(w, http.StatusOK, draft.DraftBodice(m))
}
