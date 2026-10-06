package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
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
	// FoldEdge is "left" for a half drawn against a fold (a shirt back, a
	// yoke): cut as one whole piece, so it is laid out unfolded.
	FoldEdge string `json:"foldEdge,omitempty"`
}

// Store is the thread-safe piece list of the Cutting Layout tab. On its own
// it lives in memory and starts again from the samples on every restart;
// given PieceDocs (the database) it writes every change through, so the
// pieces survive a restart.
type Store struct {
	mu     sync.Mutex
	nextID int
	pieces map[string]StoredPiece
	docs   PieceDocs
}

// PieceDocs keeps layout pieces as JSON documents keyed by their numeric ID.
type PieceDocs interface {
	LoadPieceDocs() ([][]byte, error)
	PutPieceDoc(id string, doc []byte) error
	DeletePieceDoc(id string) error
}

// NewStoreWith keeps the pieces in docs, starting with the ones already there.
func NewStoreWith(docs PieceDocs) (*Store, error) {
	raw, err := docs.LoadPieceDocs()
	if err != nil {
		return nil, err
	}
	s := &Store{pieces: make(map[string]StoredPiece), docs: docs}
	for _, doc := range raw {
		var p StoredPiece
		if err := json.Unmarshal(doc, &p); err != nil {
			return nil, fmt.Errorf("a stored layout piece isn't valid: %w", err)
		}
		s.pieces[p.ID] = p
		if n, err := strconv.Atoi(p.ID); err == nil && n > s.nextID {
			s.nextID = n
		}
	}
	return s, nil
}

func NewStore() *Store {
	s := &Store{pieces: make(map[string]StoredPiece)}
	// Seed with a small starter set so the app isn't empty on first run.
	for _, p := range []StoredPiece{
		{Name: "Bodice front", Width: 34, Height: 42, Qty: 2, Color: "#3B7A82", GrainLocked: true},
		{Name: "Bodice back", Width: 32, Height: 42, Qty: 2, Color: "#B5453D", GrainLocked: true},
		{Name: "Sleeve", Width: 28, Height: 34, Qty: 2, Color: "#C79A3E", GrainLocked: false},
	} {
		s.add(p) // in memory: cannot fail
	}
	return s
}

// add gives p the next ID and keeps it. When the pieces are written through
// and the write fails, nothing is kept.
func (s *Store) add(p StoredPiece) (StoredPiece, error) {
	p.ID = strconv.Itoa(s.nextID + 1)
	if s.docs != nil {
		doc, err := json.Marshal(p)
		if err != nil {
			return StoredPiece{}, err
		}
		if err := s.docs.PutPieceDoc(p.ID, doc); err != nil {
			return StoredPiece{}, err
		}
	}
	s.nextID++
	s.pieces[p.ID] = p
	return p, nil
}

// list is the pieces in the order they were added.
func (s *Store) list() []StoredPiece {
	out := make([]StoredPiece, 0, len(s.pieces))
	for _, p := range s.pieces {
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool {
		a, _ := strconv.Atoi(out[i].ID)
		b, _ := strconv.Atoi(out[j].ID)
		return a < b
	})
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
		created, err := s.add(p)
		s.mu.Unlock()
		if err != nil {
			log.Printf("pieces: save: %v", err)
			http.Error(w, "couldn't save the piece", http.StatusInternalServerError)
			return
		}
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
	if s.docs != nil {
		if err := s.docs.DeletePieceDoc(id); err != nil {
			log.Printf("pieces: delete %s: %v", id, err)
			http.Error(w, "couldn't delete the piece", http.StatusInternalServerError)
			return
		}
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
// toNestPieces turns stored pieces into what the nester lays out, the way
// they are really cut: a half drawn against a fold becomes the whole piece
// (half as many of them), and a pair of grain-locked pieces (a left and right
// front) becomes one of each, mirror images, rather than two identical copies.
func toNestPieces(pieces []StoredPiece) []nesting.NestPiece {
	var out []nesting.NestPiece
	for _, p := range pieces {
		path := p.PathData
		if path == "" {
			path = nesting.RectPath(p.Width, p.Height)
		}
		np := nesting.NestPiece{
			Name: p.Name, Color: p.Color, GrainLocked: p.GrainLocked,
			PathData: path, Width: p.Width, Height: p.Height, Qty: p.Qty,
		}
		switch {
		case p.FoldEdge == "left" && p.Qty%2 == 0:
			np.PathData, np.Width = nesting.UnfoldPath(path)
			np.Qty = p.Qty / 2
			out = append(out, np)
		case p.GrainLocked && p.Qty >= 2 && p.Qty%2 == 0:
			np.Qty = p.Qty / 2
			mirror := np
			mirror.PathData = nesting.MirrorPath(path)
			out = append(out, np, mirror)
		default:
			out = append(out, np)
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
