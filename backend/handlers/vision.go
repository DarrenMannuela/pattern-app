package handlers

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"patternapp/backend/vision"
)

// analyzeRequest is the body for POST /api/analyze-photo: a picture as a data
// URL ("data:image/jpeg;base64,...") or bare base64 with MediaType.
type analyzeRequest struct {
	Image     string `json:"image"`
	MediaType string `json:"mediaType"`
}

// maxPhotoBytes keeps a request to what the API accepts comfortably.
const maxPhotoBytes = 6 << 20

// PhotoStatus handles GET /api/analyze-photo/status — says whether photo reading
// is available and who would do it (the Claude API, a local model, or nobody).
func PhotoStatus(svc *vision.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, svc.Status(r.Context()))
	}
}

// AnalyzePhoto handles POST /api/analyze-photo — reads a photo of a uniform and
// returns what it is made of, in the pattern maker's terms.
func AnalyzePhoto(svc *vision.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if st, ok := svc.Available(r.Context()); !ok {
			http.Error(w, st.Hint, http.StatusNotImplemented)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxPhotoBytes*2)
		var req analyzeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid photo payload (or the picture is too large)", http.StatusBadRequest)
			return
		}
		data, mediaType, err := decodePhoto(req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		design, err := svc.Analyze(r.Context(), data, mediaType)
		if err != nil {
			http.Error(w, "couldn't read the photo: "+err.Error(), http.StatusBadGateway)
			return
		}
		writeJSON(w, http.StatusOK, design)
	}
}

// describeRequest is the body for POST /api/analyze-text: the customer's own
// words about the uniform they want.
type describeRequest struct {
	Description string `json:"description"`
}

// maxDescriptionChars is generous for a description of one uniform, and small
// enough that a local model reads it in a moment.
const maxDescriptionChars = 2000

// AnalyzeText handles POST /api/analyze-text — turns a written description of
// a uniform ("short-sleeve cream shirt, band collar, chest pocket") into a
// first-draft design in the pattern maker's terms, the same shape a photo gives.
func AnalyzeText(svc *vision.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if st, ok := svc.Available(r.Context()); !ok {
			http.Error(w, st.Hint, http.StatusNotImplemented)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
		var req describeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid description payload", http.StatusBadRequest)
			return
		}
		text := strings.TrimSpace(req.Description)
		if text == "" {
			http.Error(w, "describe the uniform first", http.StatusBadRequest)
			return
		}
		if utf8.RuneCountInString(text) > maxDescriptionChars {
			http.Error(w, "the description is too long (over 2000 characters)", http.StatusBadRequest)
			return
		}
		design, err := svc.AnalyzeText(r.Context(), text)
		if err != nil {
			http.Error(w, "couldn't read the description: "+err.Error(), http.StatusBadGateway)
			return
		}
		writeJSON(w, http.StatusOK, design)
	}
}

func decodePhoto(req analyzeRequest) ([]byte, string, error) {
	raw, mediaType := req.Image, req.MediaType
	if strings.HasPrefix(raw, "data:") {
		head, body, ok := strings.Cut(raw, ",")
		if !ok {
			return nil, "", errors.New("malformed data URL")
		}
		raw = body
		if mt, _, found := strings.Cut(strings.TrimPrefix(head, "data:"), ";"); found {
			mediaType = mt
		}
	}
	data, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, "", errors.New("the picture isn't valid base64")
	}
	if len(data) == 0 {
		return nil, "", errors.New("no picture sent")
	}
	if len(data) > maxPhotoBytes {
		return nil, "", errors.New("the picture is too large (over 6 MB)")
	}
	return data, mediaType, nil
}
