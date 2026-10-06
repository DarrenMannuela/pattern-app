package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"patternapp/backend/draft"
)

func artworkMux(t *testing.T) *http.ServeMux {
	t.Helper()
	api, err := NewArtworkAPI(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/artwork", api.Upload)
	mux.HandleFunc("/api/artwork/{id}", api.Get)
	return mux
}

func logoDataURL(t *testing.T) (string, []byte) {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, 6, 4))
	img.Set(2, 2, color.NRGBA{0, 90, 160, 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()), buf.Bytes()
}

// An uploaded logo comes back byte for byte under the id the upload answers.
func TestArtworkUploadAndServe(t *testing.T) {
	mux := artworkMux(t)
	url, raw := logoDataURL(t)
	body, _ := json.Marshal(map[string]string{"image": url})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/artwork", bytes.NewReader(body)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body)
	}
	var got struct{ ID string }
	json.NewDecoder(rec.Body).Decode(&got)

	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/artwork/"+got.ID, nil))
	if rec.Code != http.StatusOK || !bytes.Equal(rec.Body.Bytes(), raw) {
		t.Fatalf("serve: %d, %d bytes", rec.Code, rec.Body.Len())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/png" {
		t.Errorf("content type %q", ct)
	}
	if !strings.Contains(rec.Header().Get("Cache-Control"), "immutable") {
		t.Error("a content-addressed picture should be cacheable for good")
	}
}

func TestArtworkRefusesBadUploadsAndIDs(t *testing.T) {
	mux := artworkMux(t)
	for name, img := range map[string]string{
		"not base64": "data:image/png;base64,@@@",
		"svg":        "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(`<svg><script>alert(1)</script></svg>`)),
		"empty":      "",
	} {
		body, _ := json.Marshal(map[string]string{"image": img})
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/artwork", bytes.NewReader(body)))
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: got %d, want 400", name, rec.Code)
		}
	}
	for _, id := range []string{"..%2Forders.json", "nope.png", "0123456789abcdef0123456789abcdef.png"} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/artwork/"+id, nil))
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s: got %d, want 404", id, rec.Code)
		}
	}
}

// A revision can only point its prints at pictures the store gave out.
func TestMockupRequestChecksExtrasArtwork(t *testing.T) {
	ok := draft.Accessory{ID: "a", Type: "sablon", Segment: "back", Image: "0123456789abcdef0123456789abcdef.png", InkColors: []string{"#112233", "#ffffff"}}
	if msg := checkAccessories([]draft.Accessory{ok}); msg != "" {
		t.Fatalf("a good extra was refused: %s", msg)
	}
	for name, a := range map[string]draft.Accessory{
		"path":   {Image: "../orders.json"},
		"url":    {Image: "https://example.com/logo.png"},
		"colour": {InkColors: []string{"red"}},
	} {
		if checkAccessories([]draft.Accessory{a}) == "" {
			t.Errorf("%s: accepted", name)
		}
	}
}
