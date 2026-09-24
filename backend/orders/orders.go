// Package orders is the center of the app's actual workflow: a
// konveksi order for one customer, from first consultation through
// mockup revisions. Garment type and per-customer sizing decide what
// (if anything) gets drafted; everything else — notes, fabric choice,
// size chart, status — is tracked for every order regardless of
// whether pattern drafting exists for that garment type yet.
package orders

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"sync"
	"time"

	"patternapp/backend/draft"
)

// Recognized garment types. Other is tracked like any order
// (customer, notes, fabric, size chart) but GeneratePieces returns
// ErrUnsupportedGarment for it — that pattern math doesn't exist yet,
// and guessing at it would risk the same kind of broken geometry the
// dart-rotation bug produced.
const (
	// GarmentSchoolShirt and GarmentPEShirt are fixed presets (collar
	// + fitted dart for school, none for PE) — quick to start from.
	GarmentSchoolShirt = "school_shirt"
	GarmentPEShirt     = "pe_shirt"
	// GarmentPolo is a knit polo: flat collar, short placket, no yoke.
	GarmentPolo = "polo_shirt"
	// GarmentUniformShirt is the same shirt construction with no
	// preset: Style and Collar in the request's ShirtOptions are used
	// as given, so any other uniform top (company, workwear, event
	// merch) can be built by toggling those instead of picking a
	// fixed type.
	GarmentUniformShirt = "uniform_shirt"
	GarmentPants        = "pants"
	GarmentShorts       = "shorts"
	GarmentSkirt        = "skirt"
	GarmentOther        = "other"
	// GarmentCustom is a design the user traced or drew themselves; its
	// pieces come straight from the drawing (draft.DraftCustom).
	GarmentCustom = "custom"
)

// defaultShortsInseam is used when a shorts order's size row doesn't
// specify one — draft.Measurements' own default (75cm) is a
// full-length trouser inseam and would draft shorts down to the
// ankle.
const defaultShortsInseam = 18.0

// ErrUnsupportedGarment is returned by GeneratePieces for a garment
// type with no drafting logic yet.
var ErrUnsupportedGarment = errors.New("pattern drafting for this garment type isn't available yet")

// OrderSize is one row of a customer's own size chart — sizing is
// per-customer, not a fixed standard grade, so Label is free text
// (e.g. "L", "28", "Kelas 3 Putra") and Measurements are whatever the
// customer/pattern maker actually agreed on for that row.
type OrderSize struct {
	Label        string             `json:"label"`
	Measurements draft.Measurements `json:"measurements"`
	Quantity     int                `json:"quantity"`
}

// Fabric is a lightweight reference to the chosen material plus any
// free-text notes from the material-suggestion conversation with the
// customer.
type Fabric struct {
	Name  string `json:"name"`
	Notes string `json:"notes"`
}

// Mockup is one saved revision. Sizes is a snapshot of the order's
// size chart at save time (not a live reference) so a past revision
// stays meaningful even after the live chart is edited later.
type Mockup struct {
	Version   int                `json:"version"`
	Note      string             `json:"note"`
	Options   draft.ShirtOptions `json:"options"`
	Sizes     []OrderSize        `json:"sizes"`
	CreatedAt time.Time          `json:"createdAt"`
}

// ActualFabric is what cutting the order really used, recorded afterwards so
// the cutting plan's estimate can be checked against it.
type ActualFabric struct {
	Meters  float64 `json:"meters,omitempty"`
	Kg      float64 `json:"kg,omitempty"`
	WidthCm float64 `json:"widthCm,omitempty"`
	Note    string  `json:"note,omitempty"`
}

// PreviewColors are the fabric and trim colours the design preview is shown in.
type PreviewColors struct {
	Main   string `json:"main,omitempty"`
	Accent string `json:"accent,omitempty"`
}

// Order is one customer engagement, start to finish.
type Order struct {
	ID           string      `json:"id"`
	CustomerName string      `json:"customerName"`
	ContactInfo  string      `json:"contactInfo"`
	GarmentType  string      `json:"garmentType"`
	DesignNotes  string      `json:"designNotes"`
	Fabric       Fabric      `json:"fabric"`
	Sizes        []OrderSize `json:"sizes"`
	Status       string      `json:"status"` // "consultation" | "mockup" | "revision" | "approved"
	Mockups      []Mockup    `json:"mockups"`
	// DesignImage is the picture a custom design is traced over (a data
	// URL), and Design the drawing itself — opaque to the backend, owned by
	// the frontend editor. Only custom orders use them.
	DesignImage string          `json:"designImage,omitempty"`
	Design      json.RawMessage `json:"design,omitempty"`
	// PreviewColors are the colours picked for the preview (from a reference
	// photo, say), kept so reopening the order shows the same garment.
	PreviewColors PreviewColors `json:"previewColors,omitempty"`
	ActualFabric  *ActualFabric `json:"actualFabric,omitempty"`
	CreatedAt     time.Time     `json:"createdAt"`
	UpdatedAt     time.Time     `json:"updatedAt"`
}

// GeneratePieces drafts pattern pieces for every size in sizes, using
// garmentType to pick the right construction. For the two shirt
// presets, opts.Collar is forced to what that preset means (a school
// shirt always has a collar, PE never does); for GarmentUniformShirt
// it's used exactly as given, so the caller builds the garment by
// toggling it instead of picking a fixed type. opts.Gender,
// opts.DartPosition, and opts.SleeveStyle always pass through as
// given for every shirt type — which uniform this is shouldn't decide
// who it's cut for.
func GeneratePieces(garmentType string, sizes []OrderSize, opts draft.ShirtOptions) (map[string][]draft.Piece, error) {
	pieces, err := generateBlocks(garmentType, sizes, opts)
	if err != nil {
		return nil, err
	}
	// Blocks are drafted allowance-free; the patterns handed out are the
	// finished ones, with a cutting line and a grainline.
	for label, ps := range pieces {
		pieces[label] = draft.FinishAll(ps)
	}
	return pieces, nil
}

func generateBlocks(garmentType string, sizes []OrderSize, opts draft.ShirtOptions) (map[string][]draft.Piece, error) {
	switch garmentType {
	case GarmentSchoolShirt:
		opts.Collar = true
	case GarmentPEShirt:
		opts.Collar = false
	case GarmentPolo:
		opts.Collar = true
		opts.CollarStyle = "polo"
	case GarmentUniformShirt:
		// opts used as given — this type has no preset.
	case GarmentPants:
		return draftEach(sizes, func(m draft.Measurements) []draft.Piece {
			return draft.DraftTrousers(m, "Pants", opts.AddOns, opts.Trousers)
		}), nil
	case GarmentShorts:
		return draftEach(sizes, func(m draft.Measurements) []draft.Piece {
			// A size chart's inseam is a trouser length (a prefilled row says
			// 75), so it only counts as a shorts length when it is one; the
			// maker's length option overrides it.
			if cm, ok := draft.ShortsInseam(opts.Trousers.Length); ok {
				m.Inseam = cm
			} else if m.Inseam == 0 || m.Inseam > 45 {
				m.Inseam = defaultShortsInseam
			}
			return draft.DraftTrousers(m, "Shorts", opts.AddOns, opts.Trousers)
		}), nil
	case GarmentCustom:
		ps, err := draft.DraftCustom(opts.Custom)
		if err != nil {
			return nil, err
		}
		if len(sizes) == 0 {
			sizes = []OrderSize{{Label: "One size", Quantity: 1}}
		}
		return draftEach(sizes, func(draft.Measurements) []draft.Piece {
			return append([]draft.Piece(nil), ps...)
		}), nil
	case GarmentOther:
		if opts.Merch.Item == "" {
			return nil, ErrUnsupportedGarment
		}
		// Merch isn't sized by body measurements: an order with no size rows
		// still gets its one set of pieces.
		if len(sizes) == 0 {
			sizes = []OrderSize{{Label: "One size", Quantity: 1}}
		}
		return draftEach(sizes, func(draft.Measurements) []draft.Piece {
			return draft.DraftMerch(opts.Merch)
		}), nil
	case GarmentSkirt:
		return draftEach(sizes, func(m draft.Measurements) []draft.Piece {
			return draft.DraftSkirt(m, opts.AddOns, opts.Skirt)
		}), nil
	default:
		return nil, ErrUnsupportedGarment
	}
	out := make(map[string][]draft.Piece, len(sizes))
	for _, sz := range sizes {
		out[sz.Label] = draft.DraftShirt(sz.Measurements, opts)
	}
	return out, nil
}

// draftEach applies draftFn to every size's measurements, keyed by
// size label — the shared shape behind each non-shirt garment type's
// case above.
func draftEach(sizes []OrderSize, draftFn func(draft.Measurements) []draft.Piece) map[string][]draft.Piece {
	out := make(map[string][]draft.Piece, len(sizes))
	for _, sz := range sizes {
		out[sz.Label] = draftFn(sz.Measurements)
	}
	return out
}

// Store is a mutex-guarded order list persisted to a JSON file on
// every write — the app has no database, and a small konveksi's order
// volume doesn't need one, but orders must survive a server restart
// (nothing in this app persisted before this package).
type Store struct {
	mu     sync.Mutex
	path   string
	nextID int
	orders map[string]*Order
}

// NewStore opens (or creates) the JSON file at path as the backing
// store, loading any orders already in it. It fails only when the file
// exists but can't be read: carrying on with an empty list would let the
// next save overwrite the orders that are really there.
func NewStore(path string) (*Store, error) {
	s := &Store{path: path, orders: make(map[string]*Order), nextID: 1}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

// load reads the order file. A missing or empty file is a fresh start. A file
// that isn't valid JSON (a crash mid-write, a bad hand edit) is moved aside,
// never overwritten, so its contents can still be recovered, and the store
// starts empty.
func (s *Store) load() error {
	data, err := os.ReadFile(s.path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read orders file: %w", err)
	}
	if len(bytes.TrimSpace(data)) == 0 {
		return nil
	}
	var list []*Order
	if err := json.Unmarshal(data, &list); err != nil {
		aside := fmt.Sprintf("%s.corrupt-%s", s.path, time.Now().Format("20060102-150405"))
		if rerr := os.Rename(s.path, aside); rerr != nil {
			return fmt.Errorf("orders file is not valid JSON (%v) and could not be moved aside: %w", err, rerr)
		}
		log.Printf("orders: %s is not valid JSON (%v); kept as %s and starting with no orders", s.path, err, aside)
		return nil
	}
	for _, o := range list {
		if o == nil {
			continue
		}
		s.orders[o.ID] = o
		if n, err := strconv.Atoi(o.ID); err == nil && n >= s.nextID {
			s.nextID = n + 1
		}
	}
	return nil
}

// saveLocked writes the current order list to disk. It writes a temporary
// file beside the real one and renames it into place, so a crash or a full
// disk mid-write leaves the previous file intact instead of a truncated one.
// Caller must hold s.mu.
func (s *Store) saveLocked() error {
	data, err := json.MarshalIndent(s.listLocked(), "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(s.path), filepath.Base(s.path)+".tmp-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name()) // a no-op once the rename has moved it
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), s.path)
}

// clone is a shallow copy handed to callers, so a request encoding an order
// never races another request that is updating it. Updates replace the
// order's fields wholesale rather than editing them in place, which is what
// makes a shallow copy enough.
func (o *Order) clone() *Order {
	c := *o
	return &c
}

func (s *Store) listLocked() []*Order {
	out := make([]*Order, 0, len(s.orders))
	for _, o := range s.orders {
		out = append(out, o)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

// List returns every order, oldest first.
func (s *Store) List() []*Order {
	s.mu.Lock()
	defer s.mu.Unlock()
	list := s.listLocked()
	for i, o := range list {
		list[i] = o.clone()
	}
	return list
}

// Get returns one order by ID.
func (s *Store) Get(id string) (*Order, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	o, ok := s.orders[id]
	if !ok {
		return nil, false
	}
	return o.clone(), true
}

// Create assigns an ID and timestamps, stores, and persists o. If the save
// fails the order is not kept, so memory never holds what the disk doesn't.
func (s *Store) Create(o *Order) (*Order, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	o.ID = strconv.Itoa(s.nextID)
	s.nextID++
	now := time.Now()
	o.CreatedAt, o.UpdatedAt = now, now
	if o.Status == "" {
		o.Status = "consultation"
	}
	s.orders[o.ID] = o
	if err := s.saveLocked(); err != nil {
		delete(s.orders, o.ID)
		return nil, err
	}
	return o.clone(), nil
}

// Update replaces the editable fields of an existing order (ID,
// CreatedAt and Mockups are preserved regardless of what patch carries).
// If the save fails the order goes back to how it was.
func (s *Store) Update(id string, patch *Order) (*Order, error, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	existing, ok := s.orders[id]
	if !ok {
		return nil, nil, false
	}
	prev := *existing
	existing.CustomerName = patch.CustomerName
	existing.ContactInfo = patch.ContactInfo
	existing.GarmentType = patch.GarmentType
	existing.DesignNotes = patch.DesignNotes
	existing.Fabric = patch.Fabric
	existing.Sizes = patch.Sizes
	existing.DesignImage = patch.DesignImage
	existing.Design = patch.Design
	existing.PreviewColors = patch.PreviewColors
	existing.ActualFabric = patch.ActualFabric
	if patch.Status != "" {
		existing.Status = patch.Status
	}
	existing.UpdatedAt = time.Now()
	if err := s.saveLocked(); err != nil {
		*existing = prev
		return nil, err, true
	}
	return existing.clone(), nil, true
}

// Delete removes an order permanently. If the save fails the order is kept
// and the error returned, so a delete is never reported that the disk lost.
func (s *Store) Delete(id string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	o, ok := s.orders[id]
	if !ok {
		return false, nil
	}
	delete(s.orders, id)
	if err := s.saveLocked(); err != nil {
		s.orders[id] = o
		return true, err
	}
	return true, nil
}

// AddMockup snapshots the order's current size chart into a new
// Mockup revision, appends it, and returns both the updated order and
// the freshly drafted pieces for that revision (keyed by size label).
func (s *Store) AddMockup(id, note string, opts draft.ShirtOptions) (*Order, map[string][]draft.Piece, error, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	o, ok := s.orders[id]
	if !ok {
		return nil, nil, nil, false
	}
	pieces, err := GeneratePieces(o.GarmentType, o.Sizes, opts)
	if err != nil {
		return nil, nil, err, true
	}
	prev := *o
	mockup := Mockup{
		Version:   len(o.Mockups) + 1,
		Note:      note,
		Options:   opts,
		Sizes:     append([]OrderSize(nil), o.Sizes...), // snapshot, not a live slice reference
		CreatedAt: time.Now(),
	}
	o.Mockups = append(o.Mockups, mockup)
	if o.Status == "consultation" {
		o.Status = "mockup"
	} else if o.Status == "mockup" {
		o.Status = "revision"
	}
	o.UpdatedAt = time.Now()
	if err := s.saveLocked(); err != nil {
		*o = prev
		return nil, nil, err, true
	}
	return o.clone(), pieces, nil, true
}

// MockupPieces regenerates pieces for a previously saved revision
// from its own snapshot, so edits to the live size chart never change
// what an old revision looked like.
func MockupPieces(o *Order, version int) (Mockup, map[string][]draft.Piece, error, bool) {
	for _, m := range o.Mockups {
		if m.Version == version {
			pieces, err := GeneratePieces(o.GarmentType, m.Sizes, m.Options)
			return m, pieces, err, true
		}
	}
	return Mockup{}, nil, nil, false
}
