package orders

import (
	"path/filepath"
	"testing"
)

// The reference photo and the colours picked from it are part of the order:
// they survive an update and a reload.
func TestOrderKeepsReferencePhotoAndColors(t *testing.T) {
	path := filepath.Join(t.TempDir(), "orders.json")
	s := NewStore(path)
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
	got, _ := NewStore(path).Get(o.ID)
	if got.DesignImage != patch.DesignImage || got.PreviewColors != patch.PreviewColors {
		t.Errorf("not kept: %+v", got)
	}
}
