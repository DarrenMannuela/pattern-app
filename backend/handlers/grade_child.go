package handlers

import (
	"net/http"

	"patternapp/backend/draft"
	"patternapp/backend/grading"
)

// gradeChildRequest mirrors gradeRequest but has no DartPosition —
// the child block is always dartless — and BaseSize/Sizes are ages.
type gradeChildRequest struct {
	draft.Measurements
	BaseSize string   `json:"baseSize"`
	Sizes    []string `json:"sizes"`
}

// gradedChildSize is one row of a generated child size run.
type gradedChildSize struct {
	Size         string             `json:"size"`
	Measurements draft.Measurements `json:"measurements"`
	Pieces       []draft.Piece      `json:"pieces"`
}

// GradeChild handles POST /api/grade-child — takes base measurements
// anchored at an age, and returns drafted dartless front/back pieces
// for every requested age in the run.
func GradeChild(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req gradeChildRequest
	if r.ContentLength != 0 {
		if !readJSON(w, r, &req, maxBodyBytes, "grading payload") {
			return
		}
		if msg := checkMeasurements(req.Measurements); msg != "" {
			http.Error(w, msg, http.StatusBadRequest)
			return
		}
	}

	baseSize := req.BaseSize
	if baseSize == "" {
		baseSize = "8"
	}
	sizes := req.Sizes
	if len(sizes) == 0 {
		sizes = grading.StandardChildSizes
	}

	perSize, err := grading.GradeChildMeasurements(
		req.Measurements, grading.StandardChildSizes, baseSize, sizes,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	requested := make(map[string]bool, len(sizes))
	for _, sz := range sizes {
		requested[sz] = true
	}

	out := make([]gradedChildSize, 0, len(sizes))
	for _, sz := range grading.StandardChildSizes {
		if !requested[sz] {
			continue
		}
		m := perSize[sz]
		out = append(out, gradedChildSize{
			Size: sz, Measurements: m,
			Pieces: draft.DraftChildBodice(m),
		})
	}

	writeJSON(w, http.StatusOK, out)
}
