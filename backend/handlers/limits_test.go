package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"patternapp/backend/draft"
	"patternapp/backend/orders"
)

func TestCheckMeasurements(t *testing.T) {
	if msg := checkMeasurements(draft.Measurements{}); msg != "" {
		t.Errorf("unset measurements (all zero, meaning 'use the defaults') rejected: %s", msg)
	}
	if msg := checkMeasurements(draft.Measurements{Bust: 96, Waist: 84, Shoulder: 13, Neck: 38}); msg != "" {
		t.Errorf("ordinary measurements rejected: %s", msg)
	}
	for name, m := range map[string]draft.Measurements{
		"negative":    {Bust: -1},
		"far too big": {Shoulder: 1e9},
		"just over":   {Neck: maxMeasurementCm + 1},
	} {
		msg := checkMeasurements(m)
		if msg == "" {
			t.Errorf("%s: accepted", name)
		}
		if name == "far too big" && !strings.Contains(msg, "shoulder") {
			t.Errorf("message should name the field: %q", msg)
		}
	}
}

func TestCheckNumbersFindsNestedOutliers(t *testing.T) {
	ok := mockupRequest{Accessories: []draft.Accessory{{Type: "pocket", Width: 10, Height: 11.5, Position: &draft.Position{X: 0.3, Y: 0.4}}}}
	if msg := checkNumbers(&ok); msg != "" {
		t.Errorf("ordinary options rejected: %s", msg)
	}
	bad := ok
	bad.Accessories = []draft.Accessory{{Type: "pocket", Width: 1e9}}
	if msg := checkNumbers(&bad); !strings.Contains(msg, "width") {
		t.Errorf("huge accessory width not caught: %q", msg)
	}
	bad = mockupRequest{Merch: draft.MerchOptions{Width: 1e9}}
	if checkNumbers(&bad) == "" {
		t.Error("huge merch width not caught")
	}
}

// The request that used to keep the drafter busy for minutes is now refused at once.
func TestAbsurdMeasurementIsRefusedQuickly(t *testing.T) {
	api, err := NewOrdersAPI(t.TempDir() + "/orders.json")
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	api.List(rec, httptest.NewRequest(http.MethodPost, "/api/orders", strings.NewReader(`{"customerName":"x","garmentType":"school_shirt"}`)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}

	body := `{"sizes":[{"label":"X","quantity":1,"measurements":{"bust":1000000000}}]}`
	for name, call := range map[string]func(http.ResponseWriter, *http.Request){"preview": api.Preview, "mockup": api.CreateMockup} {
		req := httptest.NewRequest(http.MethodPost, "/x", strings.NewReader(body))
		req.SetPathValue("id", "1")
		rec := httptest.NewRecorder()
		start := time.Now()
		call(rec, req)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "bust") {
			t.Errorf("%s: %d %q", name, rec.Code, rec.Body)
		}
		if time.Since(start) > time.Second {
			t.Errorf("%s: took %v", name, time.Since(start))
		}
	}

	rec = httptest.NewRecorder()
	Draft(rec, httptest.NewRequest(http.MethodPost, "/api/draft", strings.NewReader(`{"bust":1e12}`)))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("draft: %d", rec.Code)
	}
}

func TestOrderWithAbsurdSizeIsRefused(t *testing.T) {
	o := orders.Order{CustomerName: "x", GarmentType: orders.GarmentPants, Sizes: []orders.OrderSize{{Label: "M", Measurements: draft.Measurements{Hip: 1e7}}}}
	if validateOrder(&o) == "" {
		t.Error("accepted")
	}
}
