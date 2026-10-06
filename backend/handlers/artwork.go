package handlers

import (
	"bytes"
	"errors"
	"log"
	"net/http"
	"time"

	"patternapp/backend/artwork"
)

// ArtworkAPI serves the logos and pictures uploaded for embroidery and sablon.
type ArtworkAPI struct {
	store artwork.Keeper
}

// NewArtworkAPI keeps uploaded pictures in dir.
func NewArtworkAPI(dir string) (*ArtworkAPI, error) {
	s, err := artwork.New(dir)
	if err != nil {
		return nil, err
	}
	return &ArtworkAPI{store: s}, nil
}

// NewArtworkAPIWith keeps uploaded pictures in k (the database).
func NewArtworkAPIWith(k artwork.Keeper) *ArtworkAPI { return &ArtworkAPI{store: k} }

// artworkRequest is the body for POST /api/artwork: the picture as a data URL.
type artworkRequest struct {
	Image string `json:"image"`
}

// Upload handles POST /api/artwork — stores a picture and answers its id,
// which an embroidery or sablon then carries as its image.
func (a *ArtworkAPI) Upload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req artworkRequest
	// Base64 is a third larger than the picture it carries.
	if !readJSON(w, r, &req, artwork.MaxBytes*3/2, "artwork payload") {
		return
	}
	data, _, err := decodeDataURL(req.Image, "", artwork.MaxBytes)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	id, err := a.store.Save(data)
	var bad *artwork.InvalidError
	switch {
	case errors.As(err, &bad):
		http.Error(w, bad.Error(), http.StatusBadRequest)
		return
	case err != nil:
		log.Printf("artwork: save: %v", err)
		http.Error(w, "couldn't store the picture", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// Get handles GET /api/artwork/{id}. A picture never changes under its id (the
// id is its content hash), so browsers may keep it for good.
func (a *ArtworkAPI) Get(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id := r.PathValue("id")
	data, err := a.store.Load(id)
	switch {
	case errors.Is(err, artwork.ErrNotFound):
		http.NotFound(w, r)
		return
	case err != nil:
		log.Printf("artwork: load %s: %v", id, err)
		http.Error(w, "couldn't read the picture", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", artwork.ContentType(id))
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("ETag", `"`+id+`"`)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, id, time.Time{}, bytes.NewReader(data))
}
