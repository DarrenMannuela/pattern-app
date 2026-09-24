package orders

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"patternapp/backend/draft"
)

func mustStore(t *testing.T, path string) *Store {
	t.Helper()
	s, err := NewStore(path)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	return s
}

// makeUnwritable stops the store from saving into dir, restoring access when
// the test ends so the temp dir can be cleaned up.
func makeUnwritable(t *testing.T, dir string) {
	t.Helper()
	if os.Geteuid() == 0 {
		t.Skip("root ignores directory permissions")
	}
	if err := os.Chmod(dir, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Chmod(dir, 0o700) })
}

// The reference photo and the colours picked from it are part of the order:
// they survive an update and a reload.
func TestOrderKeepsReferencePhotoAndColors(t *testing.T) {
	path := filepath.Join(t.TempDir(), "orders.json")
	s := mustStore(t, path)
	o, err := s.Create(&Order{CustomerName: "Photo", GarmentType: GarmentUniformShirt})
	if err != nil {
		t.Fatal(err)
	}
	patch := *o
	patch.DesignImage = "data:image/jpeg;base64,AAAA"
	patch.PreviewColors = PreviewColors{Main: "#c0c0c0", Accent: "#e60000"}
	if _, err, ok := s.Update(o.ID, &patch); err != nil || !ok {
		t.Fatalf("update: %v %v", err, ok)
	}
	got, _ := mustStore(t, path).Get(o.ID)
	if got.DesignImage != patch.DesignImage || got.PreviewColors != patch.PreviewColors {
		t.Errorf("not kept: %+v", got)
	}
}

// A file that isn't valid JSON must never be overwritten by the next save: it
// is moved aside with its contents intact, and the store starts empty.
func TestCorruptOrdersFileIsKeptNotOverwritten(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "orders.json")
	garbage := `[{"id":"1","customerName":"Half written`
	if err := os.WriteFile(path, []byte(garbage), 0o644); err != nil {
		t.Fatal(err)
	}
	s := mustStore(t, path)
	if n := len(s.List()); n != 0 {
		t.Fatalf("expected an empty store, got %d orders", n)
	}
	if _, err := s.Create(&Order{CustomerName: "New", GarmentType: GarmentPants}); err != nil {
		t.Fatal(err)
	}
	var kept []string
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), "orders.json.corrupt-") {
			kept = append(kept, e.Name())
		}
	}
	if len(kept) != 1 {
		t.Fatalf("expected one quarantined file, found %v", kept)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, kept[0])); string(b) != garbage {
		t.Errorf("quarantined file changed: %q", b)
	}
	if got := len(mustStore(t, path).List()); got != 1 {
		t.Errorf("reload found %d orders, want 1", got)
	}
}

// A file that exists but can't be read is an error, not a reason to start
// empty and overwrite it later.
func TestUnreadableOrdersFileIsAnError(t *testing.T) {
	path := filepath.Join(t.TempDir(), "orders.json")
	if err := os.Mkdir(path, 0o755); err != nil { // reading a directory fails
		t.Fatal(err)
	}
	if _, err := NewStore(path); err == nil {
		t.Fatal("expected an error")
	}
}

func TestEmptyOrdersFileStartsFresh(t *testing.T) {
	path := filepath.Join(t.TempDir(), "orders.json")
	if err := os.WriteFile(path, []byte("  \n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if n := len(mustStore(t, path).List()); n != 0 {
		t.Errorf("got %d orders", n)
	}
}

// Saves leave nothing behind but the orders file itself.
func TestSaveLeavesNoTempFiles(t *testing.T) {
	dir := t.TempDir()
	s := mustStore(t, filepath.Join(dir, "orders.json"))
	for i := 0; i < 3; i++ {
		if _, err := s.Create(&Order{CustomerName: "A", GarmentType: GarmentPants}); err != nil {
			t.Fatal(err)
		}
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 || entries[0].Name() != "orders.json" {
		t.Errorf("unexpected files: %v", entries)
	}
}

// When the disk refuses the save, the caller hears about it and the order in
// memory is the one that is on disk.
func TestFailedSaveIsReportedAndRolledBack(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "orders.json")
	s := mustStore(t, path)
	o, err := s.Create(&Order{CustomerName: "Keep", GarmentType: GarmentPants})
	if err != nil {
		t.Fatal(err)
	}
	makeUnwritable(t, dir)

	edit := *o
	edit.CustomerName = "Changed"
	if _, err, ok := s.Update(o.ID, &edit); err == nil || !ok {
		t.Errorf("update should report the failed save (err=%v ok=%v)", err, ok)
	}
	if got, _ := s.Get(o.ID); got.CustomerName != "Keep" {
		t.Errorf("update not rolled back: %q", got.CustomerName)
	}

	if found, err := s.Delete(o.ID); !found || err == nil {
		t.Errorf("delete should report the failed save (found=%v err=%v)", found, err)
	}
	if _, ok := s.Get(o.ID); !ok {
		t.Error("order vanished although the delete was not saved")
	}

	if _, err := s.Create(&Order{CustomerName: "Lost", GarmentType: GarmentPants}); err == nil {
		t.Error("create should report the failed save")
	}
	if n := len(s.List()); n != 1 {
		t.Errorf("failed create left %d orders in memory, want 1", n)
	}
	if _, _, err, ok := s.AddMockup(o.ID, "v1", draft.ShirtOptions{}); err == nil || !ok {
		t.Errorf("mockup should report the failed save (err=%v ok=%v)", err, ok)
	}
	if got, _ := s.Get(o.ID); len(got.Mockups) != 0 || got.Status != "consultation" {
		t.Errorf("mockup not rolled back: %+v", got)
	}
}

// Orders handed out are copies: editing one doesn't edit the store.
func TestGetReturnsACopy(t *testing.T) {
	s := mustStore(t, filepath.Join(t.TempDir(), "orders.json"))
	o, _ := s.Create(&Order{CustomerName: "Original", GarmentType: GarmentPants})
	o.CustomerName = "Scribbled"
	got, _ := s.Get(o.ID)
	if got.CustomerName != "Original" {
		t.Errorf("store was changed through a returned order: %q", got.CustomerName)
	}
}

func TestActualFabricIsKept(t *testing.T) {
	path := filepath.Join(t.TempDir(), "orders.json")
	s := mustStore(t, path)
	o, _ := s.Create(&Order{CustomerName: "Cut", GarmentType: GarmentPants})
	patch := *o
	patch.ActualFabric = &ActualFabric{Meters: 131.5, WidthCm: 150, Note: "PT batch 3"}
	if _, err, _ := s.Update(o.ID, &patch); err != nil {
		t.Fatal(err)
	}
	got, _ := mustStore(t, path).Get(o.ID)
	if got.ActualFabric == nil || *got.ActualFabric != *patch.ActualFabric {
		t.Errorf("not kept: %+v", got.ActualFabric)
	}
}
