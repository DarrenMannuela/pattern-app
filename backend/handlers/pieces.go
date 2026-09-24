package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"sync"

	"patternapp/backend/nesting"
)

// StoredPiece is a pattern piece as kept in the store and sent over
// the API. PathData is optional: pieces added by hand (just a
// width/height) leave it blank and get a synthesized rectangle outline
// at pack time; pieces sent from the drafting engine carry their real
// curved outline here.
type StoredPiece struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Width       float64 `json:"width"`
	Height      float64 `json:"height"`
	Qty         int     `json:"qty"`
	Color       string  `json:"color"`
	GrainLocked bool    `json:"grainLocked"`
	PathData    string  `json:"pathData,omitempty"`
	// Fabric is "" (the garment's main fabric) or "contrast" — see
	// draft.Piece.Fabric. Pieces of different fabrics come from different
	// bolts of cloth, so they are nested and their yardage counted separately
	// rather than as one length of fabric.
	Fabric string `json:"fabric,omitempty"`
}

// Store is a simple thread-safe in-memory piece list. Swap this out
// for a real database-backed implementation later without touching
// the HTTP layer.
type Store struct {
	mu     sync.Mutex
	nextID int
	pieces map[string]StoredPiece
}

func NewStore() *Store {
	s := &Store{pieces: make(map[string]StoredPiece)}
	// Seed with a small starter set so the app isn't empty on first run.
	for _, p := range []StoredPiece{
		{Name: "Bodice front", Width: 34, Height: 42, Qty: 2, Color: "#3B7A82", GrainLocked: true},
		{Name: "Bodice back", Width: 32, Height: 42, Qty: 2, Color: "#B5453D", GrainLocked: true},
		{Name: "Sleeve", Width: 28, Height: 34, Qty: 2, Color: "#C79A3E", GrainLocked: false},
	} {
		s.add(p)
	}
	return s
}

func (s *Store) add(p StoredPiece) StoredPiece {
	s.nextID++
	p.ID = strconv.Itoa(s.nextID)
	s.pieces[p.ID] = p
	return p
}

func (s *Store) list() []StoredPiece {
	out := make([]StoredPiece, 0, len(s.pieces))
	for _, p := range s.pieces {
		out = append(out, p)
	}
	return out
}

// Pieces handles GET (list) and POST (create) on /api/pieces.
func (s *Store) Pieces(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.mu.Lock()
		defer s.mu.Unlock()
		writeJSON(w, http.StatusOK, s.list())

	case http.MethodPost:
		var p StoredPiece
		if !readJSON(w, r, &p, maxBodyBytes, "piece payload") {
			return
		}
		if p.Name == "" || p.Width <= 0 || p.Height <= 0 || p.Qty <= 0 {
			http.Error(w, "name, width, height and qty are required and must be positive", http.StatusBadRequest)
			return
		}
		if p.Width > maxPieceCm || p.Height > maxPieceCm || p.Qty > maxPackInstances {
			http.Error(w, fmt.Sprintf("piece size is limited to %d cm and quantity to %d", maxPieceCm, maxPackInstances), http.StatusBadRequest)
			return
		}
		s.mu.Lock()
		created := s.add(p)
		s.mu.Unlock()
		writeJSON(w, http.StatusCreated, created)

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// PieceByID handles DELETE on /api/pieces/{id}.
func (s *Store) PieceByID(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.pieces[id]; !ok {
		http.Error(w, "piece not found", http.StatusNotFound)
		return
	}
	delete(s.pieces, id)
	w.WriteHeader(http.StatusNoContent)
}

// packRequest is the body for POST /api/pack. FabricWidth is
// required; if Pieces is omitted, the server's current stored piece
// list is used instead. Resolution (cm/grid-cell) is optional.
type packRequest struct {
	FabricWidth   float64       `json:"fabricWidth"`
	SeamAllowance float64       `json:"seamAllowance"`
	Resolution    float64       `json:"resolution,omitempty"`
	Pieces        []StoredPiece `json:"pieces,omitempty"`
}

// toNestPieces converts stored pieces into the nester's input type,
// synthesizing a rectangle outline for any piece that doesn't already
// carry real drafted geometry.
func toNestPieces(pieces []StoredPiece) []nesting.NestPiece {
	out := make([]nesting.NestPiece, len(pieces))
	for i, p := range pieces {
		path := p.PathData
		if path == "" {
			path = nesting.RectPath(p.Width, p.Height)
		}
		out[i] = nesting.NestPiece{
			Name: p.Name, Color: p.Color, GrainLocked: p.GrainLocked,
			PathData: path, Width: p.Width, Height: p.Height, Qty: p.Qty,
		}
	}
	return out
}

// Pack handles POST /api/pack.
func (s *Store) Pack(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req packRequest
	if !readJSON(w, r, &req, 8*maxBodyBytes, "pack request") {
		return
	}
	pieces := req.Pieces
	if pieces == nil {
		s.mu.Lock()
		pieces = s.list()
		s.mu.Unlock()
	}
	req.Pieces = pieces
	if msg := validatePack(req); msg != "" {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	result := nesting.PackPolygons(toNestPieces(pieces), req.FabricWidth, req.SeamAllowance, req.Resolution)
	writeJSON(w, http.StatusOK, result)
}

// Limits that keep a typo (a fabric width of 15000, a quantity of a million)
// from asking the nester for a grid or a piece list too big to hold.
const (
	maxFabricWidthCm = 500
	maxPieceCm       = 1000
	maxPackInstances = 2000
)

// validatePack returns what is wrong with a pack request, or "" if it can run.
func validatePack(req packRequest) string {
	if req.FabricWidth <= 0 || req.FabricWidth > maxFabricWidthCm {
		return fmt.Sprintf("fabricWidth must be between 0 and %d cm", maxFabricWidthCm)
	}
	if req.SeamAllowance < 0 || req.SeamAllowance > 20 {
		return "seamAllowance must be between 0 and 20 cm"
	}
	if req.Resolution != 0 && (req.Resolution < 0.1 || req.Resolution > 5) {
		return "resolution must be between 0.1 and 5 cm per cell"
	}
	total := 0
	for _, p := range req.Pieces {
		if p.Qty < 0 || p.Width < 0 || p.Height < 0 || p.Width > maxPieceCm || p.Height > maxPieceCm {
			return fmt.Sprintf("piece %q has an impossible size or quantity", p.Name)
		}
		total += p.Qty
		if total > maxPackInstances {
			return fmt.Sprintf("too many pieces to lay out at once (over %d) — send them in smaller batches", maxPackInstances)
		}
	}
	return ""
}
