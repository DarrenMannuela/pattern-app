package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The API answers a stale save with 409 and a message a person can act on.
func TestStaleSaveAnswers409(t *testing.T) {
	api, err := NewOrdersAPI(t.TempDir() + "/orders.json")
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/orders", api.List)
	mux.HandleFunc("/api/orders/{id}", api.ByID)
	call := func(method, path string, body any) *httptest.ResponseRecorder {
		data, _ := json.Marshal(body)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest(method, path, bytes.NewReader(data)))
		return w
	}
	w := call(http.MethodPost, "/api/orders", map[string]string{"customerName": "SDN 1", "garmentType": "polo_shirt"})
	var loaded map[string]any
	json.NewDecoder(w.Body).Decode(&loaded)
	path := "/api/orders/" + loaded["id"].(string)

	first := map[string]any{}
	for k, v := range loaded {
		first[k] = v
	}
	first["designNotes"] = "first screen"
	if w := call(http.MethodPut, path, first); w.Code != http.StatusOK {
		t.Fatalf("first save: %d %s", w.Code, w.Body)
	}
	loaded["designNotes"] = "second screen, opened before the first saved"
	w = call(http.MethodPut, path, loaded)
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "another screen") {
		t.Fatalf("stale save: %d %q", w.Code, w.Body)
	}
}
