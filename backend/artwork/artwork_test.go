package artwork

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"os"
	"testing"
)

func tinyPNG(t *testing.T, c color.Color) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, 4, 3))
	for y := 0; y < 3; y++ {
		for x := 0; x < 4; x++ {
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestSaveKeepsOneFilePerPicture(t *testing.T) {
	s, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	data := tinyPNG(t, color.NRGBA{200, 0, 0, 255})
	id, err := s.Save(data)
	if err != nil {
		t.Fatal(err)
	}
	if !ValidID(id) {
		t.Fatalf("id %q isn't valid", id)
	}
	again, err := s.Save(data)
	if err != nil || again != id {
		t.Fatalf("same picture gave %q (%v), want %q", again, err, id)
	}
	other, _ := s.Save(tinyPNG(t, color.NRGBA{0, 0, 200, 255}))
	if other == id {
		t.Fatal("a different picture got the same id")
	}
	path, ok := s.Path(id)
	if !ok {
		t.Fatal("no path for a saved id")
	}
	got, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(got, data) {
		t.Fatalf("stored file differs: %v", err)
	}
	entries, _ := os.ReadDir(s.dir)
	if len(entries) != 2 {
		t.Errorf("want 2 files, got %d", len(entries))
	}
}

func TestSaveRefusesWhatIsNotAPicture(t *testing.T) {
	s, _ := New(t.TempDir())
	for name, data := range map[string][]byte{
		"empty": nil,
		"text":  []byte("hello, this is not a picture"),
		"svg":   []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`),
		"cut":   tinyPNG(t, color.Black)[:20],
	} {
		if id, err := s.Save(data); err == nil {
			t.Errorf("%s: saved as %q, want an error", name, id)
		}
	}
}

func TestPathRefusesAnythingButAnID(t *testing.T) {
	s, _ := New(t.TempDir())
	for _, id := range []string{"", "../orders.json", "abc.png", "0123456789abcdef0123456789abcdef.svg", "0123456789abcdef0123456789abcdef.png/x"} {
		if _, ok := s.Path(id); ok {
			t.Errorf("%q accepted", id)
		}
	}
	if _, ok := s.Path("0123456789abcdef0123456789abcdef.png"); !ok {
		t.Error("a well-formed id was refused")
	}
}
