package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"patternapp/backend/vision"
)

const textReply = `{"garment":"shirt","fit":"unisex","sleeve":"short","neckline":"band_collar","front":"placket","back":"plain","hem":"straight","trim":"none","insert_panel":"none","leg":"not_applicable","front_pocket":"not_applicable","back_pocket":"not_applicable","waist":"not_applicable","side_stripe":"none","skirt_style":"not_applicable","motifs":[],"pattern":"solid","pockets":[{"segment":"left_chest","kind":"patch"}],"prints":[],"main_color":"#c2b8a3","accent_color":"","unsupported":[],"summary":"A cream short-sleeve shirt with a band collar.","confidence":"medium"}`

// serviceWithFakeOllama is a Service whose only reader is a local Ollama that
// has one vision model and answers every chat with textReply.
func serviceWithFakeOllama(t *testing.T) *vision.Service {
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("ANTHROPIC_AUTH_TOKEN", "")
	t.Setenv("VISION_PROVIDER", "ollama")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		switch r.URL.Path {
		case "/api/tags":
			_, _ = w.Write([]byte(`{"models":[{"name":"qwen3-vl:4b"}]}`))
		case "/api/show":
			_, _ = w.Write([]byte(`{"capabilities":["completion","vision"]}`))
		case "/api/chat":
			out, _ := json.Marshal(map[string]any{"message": map[string]any{"role": "assistant", "content": textReply}, "done": true, "done_reason": "stop"})
			_, _ = w.Write(out)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return vision.NewService().WithReaders(vision.NewAnalyzer(), vision.NewOllama(srv.URL, ""))
}

func postText(h http.HandlerFunc, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest(http.MethodPost, "/api/analyze-text", strings.NewReader(body)))
	return rec
}

func TestAnalyzeTextReadsADescription(t *testing.T) {
	h := AnalyzeText(serviceWithFakeOllama(t))
	rec := postText(h, `{"description":"  kemeja pendek warna krem, kerah tegak, saku dada  "}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var d vision.Design
	if err := json.Unmarshal(rec.Body.Bytes(), &d); err != nil {
		t.Fatal(err)
	}
	if d.Neckline != "band_collar" || d.Sleeve != "short" || d.Provider != "ollama" || len(d.Pockets) != 1 {
		t.Errorf("design not returned: %+v", d)
	}
}

func TestAnalyzeTextRejectsBadInput(t *testing.T) {
	h := AnalyzeText(serviceWithFakeOllama(t))
	cases := map[string]string{
		"blank":    `{"description":"   "}`,
		"missing":  `{}`,
		"not json": `describe a shirt`,
		"too long": `{"description":"` + strings.Repeat("a", maxDescriptionChars+1) + `"}`,
	}
	for name, body := range cases {
		if rec := postText(h, body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400 (%s)", name, rec.Code, rec.Body.String())
		}
	}
	// Exactly at the limit is fine.
	if rec := postText(h, `{"description":"`+strings.Repeat("a", maxDescriptionChars)+`"}`); rec.Code != http.StatusOK {
		t.Errorf("a description at the limit should be read, got %d", rec.Code)
	}
}

func TestAnalyzeTextOnlyAcceptsPost(t *testing.T) {
	h := AnalyzeText(serviceWithFakeOllama(t))
	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest(http.MethodGet, "/api/analyze-text", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET should be 405, got %d", rec.Code)
	}
}

func TestAnalyzeTextExplainsWhenNothingCanRead(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("ANTHROPIC_AUTH_TOKEN", "")
	t.Setenv("VISION_PROVIDER", "ollama")
	// An Ollama address nothing is listening on.
	svc := vision.NewService().WithReaders(vision.NewAnalyzer(), vision.NewOllama("http://127.0.0.1:1", ""))
	rec := postText(AnalyzeText(svc), `{"description":"a polo shirt"}`)
	if rec.Code != http.StatusNotImplemented {
		t.Errorf("status %d, want 501 with the how-to-enable hint", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Ollama") {
		t.Errorf("the hint should say how to turn reading on: %s", rec.Body.String())
	}
}
