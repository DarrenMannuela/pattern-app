package handlers

import (
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"patternapp/backend/orders"
)

func TestReadJSONAnswersBadBodies(t *testing.T) {
	cases := []struct {
		name  string
		body  string
		limit int64
		want  int
	}{
		{"ok", `{"a":1}`, 100, 0},
		{"empty", ``, 100, http.StatusBadRequest},
		{"not json", `{nope`, 100, http.StatusBadRequest},
		{"too large", `{"a":"` + strings.Repeat("x", 200) + `"}`, 100, http.StatusRequestEntityTooLarge},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(c.body))
			var dst struct{ A any }
			ok := readJSON(rec, req, &dst, c.limit, "test payload")
			if c.want == 0 {
				if !ok {
					t.Fatalf("expected success, got %d %q", rec.Code, rec.Body)
				}
				return
			}
			if ok || rec.Code != c.want {
				t.Errorf("ok=%v code=%d body=%q, want code %d", ok, rec.Code, rec.Body, c.want)
			}
			if !strings.Contains(rec.Body.String(), "test payload") {
				t.Errorf("message should name the payload: %q", rec.Body)
			}
		})
	}
}

// A value JSON can't hold must not become a 200 with a cut-off body.
func TestWriteJSONReportsUnencodableValues(t *testing.T) {
	rec := httptest.NewRecorder()
	writeJSON(rec, http.StatusOK, map[string]float64{"x": math.NaN()})
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("code = %d, want 500", rec.Code)
	}
	rec = httptest.NewRecorder()
	writeJSON(rec, http.StatusCreated, map[string]int{"x": 1})
	if rec.Code != http.StatusCreated || !strings.Contains(rec.Body.String(), `"x":1`) {
		t.Errorf("normal response broken: %d %q", rec.Code, rec.Body)
	}
}

func TestRecoverTurnsAPanicInto500(t *testing.T) {
	h := Recover(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { panic("boom") }))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("code = %d, want 500", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "boom") {
		t.Errorf("panic detail leaked to the client: %q", rec.Body)
	}
}

func TestValidatePack(t *testing.T) {
	ok := packRequest{FabricWidth: 150, SeamAllowance: 0.25, Pieces: []StoredPiece{{Name: "a", Width: 30, Height: 40, Qty: 2}}}
	if msg := validatePack(ok); msg != "" {
		t.Fatalf("valid request rejected: %s", msg)
	}
	bad := map[string]packRequest{
		"no width":          {FabricWidth: 0},
		"huge width":        {FabricWidth: 15000},
		"negative seam":     {FabricWidth: 150, SeamAllowance: -1},
		"tiny resolution":   {FabricWidth: 150, Resolution: 0.0001},
		"huge quantity":     {FabricWidth: 150, Pieces: []StoredPiece{{Name: "a", Width: 1, Height: 1, Qty: 1_000_000}}},
		"summed quantity":   {FabricWidth: 150, Pieces: []StoredPiece{{Name: "a", Width: 1, Height: 1, Qty: 3000}, {Name: "b", Width: 1, Height: 1, Qty: 3000}}},
		"negative quantity": {FabricWidth: 150, Pieces: []StoredPiece{{Name: "a", Width: 1, Height: 1, Qty: -5}}},
		"giant piece":       {FabricWidth: 150, Pieces: []StoredPiece{{Name: "a", Width: 1e9, Height: 1, Qty: 1}}},
	}
	for name, req := range bad {
		if validatePack(req) == "" {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestValidateOrder(t *testing.T) {
	good := orders.Order{CustomerName: "SDN 01", GarmentType: orders.GarmentPants, Status: "mockup"}
	if msg := validateOrder(&good); msg != "" {
		t.Fatalf("valid order rejected: %s", msg)
	}
	for name, o := range map[string]orders.Order{
		"blank name":    {CustomerName: "  ", GarmentType: orders.GarmentPants},
		"no garment":    {CustomerName: "x"},
		"unknown state": {CustomerName: "x", GarmentType: orders.GarmentPants, Status: "shipped"},
		"negative qty":  {CustomerName: "x", GarmentType: orders.GarmentPants, Sizes: []orders.OrderSize{{Label: "M", Quantity: -1}}},
		"bad actual":    {CustomerName: "x", GarmentType: orders.GarmentPants, ActualFabric: &orders.ActualFabric{Meters: -3}},
	} {
		if validateOrder(&o) == "" {
			t.Errorf("%s: accepted", name)
		}
	}
}

// A replace that names nothing must be refused, not blank the saved order.
func TestReplacingAnOrderWithAnEmptyBodyIsRefused(t *testing.T) {
	api, err := NewOrdersAPI(t.TempDir() + "/orders.json")
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	api.List(rec, httptest.NewRequest(http.MethodPost, "/api/orders", strings.NewReader(`{"customerName":"Keep","garmentType":"pants"}`)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	req := httptest.NewRequest(http.MethodPut, "/api/orders/1", strings.NewReader(`{}`))
	req.SetPathValue("id", "1")
	rec = httptest.NewRecorder()
	api.ByID(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("PUT {} = %d, want 400", rec.Code)
	}
	req = httptest.NewRequest(http.MethodGet, "/api/orders/1", nil)
	req.SetPathValue("id", "1")
	rec = httptest.NewRecorder()
	api.ByID(rec, req)
	if !strings.Contains(rec.Body.String(), "Keep") {
		t.Errorf("order was blanked: %s", rec.Body)
	}
}
