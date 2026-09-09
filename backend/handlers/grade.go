package handlers

import (
	"encoding/json"
	"net/http"

	"patternapp/backend/draft"
	"patternapp/backend/grading"
)

// gradeRequest embeds base Measurements (the sample/base size) plus
// which size to anchor them at and which sizes to generate. Sizes
// left empty defaults to the full standard adult run.
type gradeRequest struct {
	draft.Measurements
	DartPosition string   `json:"dartPosition"`
	BaseSize     string   `json:"baseSize"`
	Sizes        []string `json:"sizes"`
}

// gradedSize is one row of a generated size run: the size label, the
// graded measurements that produced it, and the drafted pieces.
type gradedSize struct {
	Size         string             `json:"size"`
	Measurements draft.Measurements `json:"measurements"`
	Pieces       []draft.Piece      `json:"pieces"`
}

// Grade handles POST /api/grade — takes base measurements anchored at
// a base size, and returns drafted front/back pieces for every
// requested size in the run, graded by standard adult increments.
func Grade(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req gradeRequest
	if r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid grading payload", http.StatusBadRequest)
			return
		}
	}

	baseSize := req.BaseSize
	if baseSize == "" {
		baseSize = "M"
	}
	sizes := req.Sizes
	if len(sizes) == 0 {
		sizes = grading.StandardAdultSizes
	}

	perSize, err := grading.GradeMeasurements(
		req.Measurements, grading.StandardAdultSizes, baseSize,
		grading.DefaultAdultGradeRule, sizes,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// requested tracks which sizes to include; iterating
	// StandardAdultSizes (rather than req.Sizes directly) keeps the
	// response in small-to-large order regardless of request order.
	requested := make(map[string]bool, len(sizes))
	for _, sz := range sizes {
		requested[sz] = true
	}

	out := make([]gradedSize, 0, len(sizes))
	for _, sz := range grading.StandardAdultSizes {
		if !requested[sz] {
			continue
		}
		m := perSize[sz]
		out = append(out, gradedSize{
			Size:         sz,
			Measurements: m,
			Pieces:       draft.DraftBodice(m, req.DartPosition),
		})
	}

	writeJSON(w, http.StatusOK, out)
}
