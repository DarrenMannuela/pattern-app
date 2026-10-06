package pgstore

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"patternapp/backend/artwork"
	"patternapp/backend/draft"
	"patternapp/backend/handlers"
	"patternapp/backend/orders"
)

// freshDB opens a new, empty database for one test, made on the server at
// TEST_DATABASE_URL and dropped afterwards. Without TEST_DATABASE_URL the
// test is skipped: these need a real PostgreSQL, e.g.
//
//	docker run -d --rm --name pgtest -e POSTGRES_PASSWORD=test -p 127.0.0.1:55432:5432 postgres:16-alpine
//	TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/postgres go test ./pgstore/
func freshDB(t *testing.T) (*DB, string) {
	t.Helper()
	admin := os.Getenv("TEST_DATABASE_URL")
	if admin == "" {
		t.Skip("set TEST_DATABASE_URL to run the PostgreSQL tests")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, admin)
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("konveksi_test_%d", time.Now().UnixNano())
	if _, err := conn.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(admin)
	u.Path = "/" + name
	db, err := Open(ctx, u.String(), 10*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Close()
		conn.Exec(ctx, "DROP DATABASE "+name+" WITH (FORCE)")
		conn.Close(ctx)
	})
	return db, u.String()
}

func TestOpeningTwiceKeepsTheSchemaAndData(t *testing.T) {
	db, url := freshDB(t)
	if _, err := db.Orders().(ordersTable).db.pool.Exec(context.Background(), `INSERT INTO orders (id, data, created_at, updated_at) VALUES (99, '{"id":"99"}', now(), now())`); err != nil {
		t.Fatal(err)
	}
	again, err := Open(context.Background(), url, 5*time.Second)
	if err != nil {
		t.Fatalf("second open: %v", err)
	}
	defer again.Close()
	list, err := again.Orders().Load()
	if err != nil || len(list) != 1 {
		t.Fatalf("data lost on reopen: %v %d", err, len(list))
	}
}

// The order store on the database behaves as it does on the file: every
// change survives reopening it.
func TestOrdersSurviveReopening(t *testing.T) {
	db, _ := freshDB(t)
	s, err := orders.NewStoreWith(db.Orders())
	if err != nil {
		t.Fatal(err)
	}
	m := draft.Measurements{Bust: 94, Waist: 86, Hip: 100, BackWaistLength: 43, Shoulder: 16, Neck: 40, Ease: 6, SleeveLength: 22, UpperArm: 31, Wrist: 17}
	a, err := s.Create(&orders.Order{CustomerName: "SDN 1", GarmentType: orders.GarmentSchoolShirt, Sizes: []orders.OrderSize{{Label: "L", Quantity: 20, Measurements: m}}})
	if err != nil {
		t.Fatal(err)
	}
	b, _ := s.Create(&orders.Order{CustomerName: "Gone", GarmentType: orders.GarmentPolo})
	patch := *a
	patch.DesignNotes = "navy, logo on the chest"
	patch.Fabric = orders.Fabric{Name: "Tetoron"}
	if _, err, _ := s.Update(a.ID, &patch); err != nil {
		t.Fatal(err)
	}
	acc := draft.Accessory{ID: "x", Type: "embroidery", Segment: "left_chest", Image: "0123456789abcdef0123456789abcdef.png", Width: 8, Height: 8, InkColors: []string{"#112233"}}
	if _, _, err, _ := s.AddMockup(a.ID, "v1", draft.ShirtOptions{SleeveStyle: "half", AddOns: draft.AddOns{Accessories: []draft.Accessory{acc}}}); err != nil {
		t.Fatal(err)
	}
	if ok, err := s.Delete(b.ID); !ok || err != nil {
		t.Fatalf("delete: %v %v", ok, err)
	}

	again, err := orders.NewStoreWith(db.Orders())
	if err != nil {
		t.Fatal(err)
	}
	if again.Len() != 1 {
		t.Fatalf("want 1 order, got %d", again.Len())
	}
	got, ok := again.Get(a.ID)
	if !ok || got.DesignNotes != patch.DesignNotes || got.Fabric.Name != "Tetoron" || got.Status != "mockup" || len(got.Mockups) != 1 {
		t.Fatalf("order not kept: %+v", got)
	}
	if acc2 := got.Mockups[0].Options.AddOns.Accessories[0]; acc2.Image != acc.Image || acc2.InkColors[0] != "#112233" {
		t.Errorf("the logo didn't survive: %+v", acc2)
	}
	if got.Sizes[0].Measurements.Bust != 94 {
		t.Errorf("measurements lost: %+v", got.Sizes)
	}
	// The next order carries on from the highest id, not from 1.
	c, _ := again.Create(&orders.Order{CustomerName: "Next", GarmentType: orders.GarmentPants})
	if c.ID != "3" {
		t.Errorf("next id %s, want 3", c.ID)
	}
}

func TestImportKeepsIDsAndSkipsWhatIsThere(t *testing.T) {
	db, _ := freshDB(t)
	now := time.Now()
	list := []*orders.Order{
		{ID: "25", CustomerName: "tes", GarmentType: orders.GarmentSchoolShirt, Status: "consultation", CreatedAt: now, UpdatedAt: now},
		{ID: "185", CustomerName: "tes", GarmentType: orders.GarmentSchoolShirt, Status: "consultation", CreatedAt: now, UpdatedAt: now},
	}
	if n, err := db.ImportOrders(list); err != nil || n != 2 {
		t.Fatalf("import: %d %v", n, err)
	}
	if n, err := db.ImportOrders(list); err != nil || n != 0 {
		t.Fatalf("second import added %d (%v), want 0", n, err)
	}
	s, _ := orders.NewStoreWith(db.Orders())
	if _, ok := s.Get("185"); !ok {
		t.Fatal("order 185 missing")
	}
	if o, _ := s.Create(&orders.Order{CustomerName: "new", GarmentType: orders.GarmentPolo}); o.ID != "186" {
		t.Errorf("new order got id %s, want 186", o.ID)
	}
}

func logoPNG(t *testing.T, c color.Color) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, 5, 5))
	img.Set(2, 2, c)
	var buf bytes.Buffer
	png.Encode(&buf, img)
	return buf.Bytes()
}

func TestArtworkKeptInTheDatabase(t *testing.T) {
	db, _ := freshDB(t)
	k := db.Artwork()
	data := logoPNG(t, color.NRGBA{200, 0, 0, 255})
	id, err := k.Save(data)
	if err != nil {
		t.Fatal(err)
	}
	if again, err := k.Save(data); err != nil || again != id {
		t.Fatalf("saving again: %q %v", again, err)
	}
	got, err := k.Load(id)
	if err != nil || !bytes.Equal(got, data) {
		t.Fatalf("load: %v", err)
	}
	if _, err := k.Load("0123456789abcdef0123456789abcdef.png"); !errors.Is(err, artwork.ErrNotFound) {
		t.Errorf("missing picture: %v", err)
	}
	if _, err := k.Load("../etc/passwd"); !errors.Is(err, artwork.ErrNotFound) {
		t.Errorf("bad id: %v", err)
	}
	var bad *artwork.InvalidError
	if _, err := k.Save([]byte("not a picture")); !errors.As(err, &bad) {
		t.Errorf("text accepted: %v", err)
	}

	// The logo folder of a file-kept backend comes across.
	dir := t.TempDir()
	files, _ := artwork.New(dir)
	other := logoPNG(t, color.NRGBA{0, 0, 200, 255})
	otherID, _ := files.Save(other)
	os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("ignored"), 0o644)
	if n, err := db.ImportArtworkDir(dir); err != nil || n != 1 {
		t.Fatalf("import folder: %d %v", n, err)
	}
	if got, err := k.Load(otherID); err != nil || !bytes.Equal(got, other) {
		t.Errorf("imported logo: %v", err)
	}
	if n, err := db.ImportArtworkDir(filepath.Join(dir, "missing")); err != nil || n != 0 {
		t.Errorf("missing folder: %d %v", n, err)
	}
}

// The Cutting Layout starts with its samples once, and keeps what is added
// and removed across restarts.
func TestLayoutPiecesSurviveRestarts(t *testing.T) {
	db, _ := freshDB(t)
	s, err := handlers.NewStoreWith(db)
	if err != nil {
		t.Fatal(err)
	}
	list := func(s *handlers.Store) []handlers.StoredPiece {
		rec := httptest.NewRecorder()
		s.Pieces(rec, httptest.NewRequest(http.MethodGet, "/api/pieces", nil))
		var out []handlers.StoredPiece
		json.NewDecoder(rec.Body).Decode(&out)
		return out
	}
	if got := list(s); len(got) != 3 || got[0].Name != "Bodice front" {
		t.Fatalf("want the 3 sample pieces first, got %+v", got)
	}
	rec := httptest.NewRecorder()
	s.Pieces(rec, httptest.NewRequest(http.MethodPost, "/api/pieces", strings.NewReader(`{"name":"Collar","width":40,"height":8,"qty":2}`)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("add: %d %s", rec.Code, rec.Body)
	}
	rec = httptest.NewRecorder()
	s.PieceByID(rec, httptest.NewRequest(http.MethodDelete, "/api/pieces/1", nil), "1")
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: %d", rec.Code)
	}

	restarted, err := handlers.NewStoreWith(db)
	if err != nil {
		t.Fatal(err)
	}
	got := list(restarted)
	if len(got) != 3 || got[0].ID != "2" || got[2].Name != "Collar" || got[2].ID != "4" {
		t.Fatalf("after a restart: %+v", got)
	}
	// Deleting every piece doesn't bring the samples back on the next start.
	for _, p := range got {
		restarted.PieceByID(httptest.NewRecorder(), httptest.NewRequest(http.MethodDelete, "/api/pieces/"+p.ID, nil), p.ID)
	}
	empty, _ := handlers.NewStoreWith(db)
	if n := len(list(empty)); n != 0 {
		t.Errorf("want no pieces, got %d", n)
	}
}
