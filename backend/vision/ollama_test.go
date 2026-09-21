package vision

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/anthropics/anthropic-sdk-go/option"
)

// fakeOllama serves a model list, each model's capabilities, and chat answers.
func fakeOllama(t *testing.T, models map[string][]string, chatContent string, chatBody *map[string]any) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		switch r.URL.Path {
		case "/api/tags":
			list := []map[string]any{}
			for n := range models {
				list = append(list, map[string]any{"name": n})
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"models": list})
		case "/api/show":
			var req map[string]any
			_ = json.NewDecoder(r.Body).Decode(&req)
			_ = json.NewEncoder(w).Encode(map[string]any{"capabilities": models[req["model"].(string)]})
		case "/api/chat":
			body, _ := io.ReadAll(r.Body)
			if chatBody != nil {
				_ = json.Unmarshal(body, chatBody)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]any{"role": "assistant", "content": chatContent}, "done": true, "done_reason": "stop"})
		default:
			http.NotFound(w, r)
		}
	}))
}

// A small model can slip: an invented neckline, a made-up pocket place, a colour
// without its #.
const sloppyReply = `{"garment":"SHIRT","fit":"female","sleeve":"short","neckline":"mandarin","front":"hidden_placket","back":"plain","hem":"curved","trim":"contrast_trim","insert_panel":"side_panel","leg":"not_applicable","front_pocket":"not_applicable","back_pocket":"not_applicable","waist":"not_applicable","side_stripe":"none","skirt_style":"not_applicable","motifs":["hem_band","sparkles"],"pattern":"BATIK","pockets":[{"segment":"left_chest","kind":"patch"},{"segment":"forehead","kind":"patch"}],"prints":[{"type":"embroidery","segment":"right_chest","description":"logo"}],"main_color":"C8B79A","accent_color":"red","unsupported":[],"summary":"A shirt.","confidence":"high"}`

func TestOllamaReadsThePhoto(t *testing.T) {
	var sent map[string]any
	srv := fakeOllama(t, map[string][]string{"qwen2.5vl:3b": {"completion", "vision"}}, sloppyReply, &sent)
	defer srv.Close()

	o := NewOllama(srv.URL, "qwen2.5vl:3b")
	d, err := o.Analyze(context.Background(), []byte("jpeg bytes"), "image/jpeg")
	if err != nil {
		t.Fatal(err)
	}
	if d.Provider != "ollama" || d.Model != "qwen2.5vl:3b" {
		t.Errorf("provider not recorded: %+v", d)
	}
	// The slips are put right, and a local model's "high" is capped.
	if d.Garment != "shirt" || d.Neckline != "not_applicable" || d.MainColor != "#c8b79a" || d.AccentColor != "" {
		t.Errorf("design not normalised: %+v", d)
	}
	if len(d.Pockets) != 1 || d.Pockets[0].Segment != "left_chest" {
		t.Errorf("a pocket on an unknown place should be dropped: %+v", d.Pockets)
	}
	if len(d.Motifs) != 1 || d.Motifs[0] != "hem_band" || d.Pattern != "batik" {
		t.Errorf("motifs and pattern should be normalised: %v %q", d.Motifs, d.Pattern)
	}
	if d.Confidence != "medium" {
		t.Errorf("a local model's confidence is capped at medium, got %q", d.Confidence)
	}

	// The request carries the picture, the schema, and no streaming.
	if sent["model"] != "qwen2.5vl:3b" || sent["stream"] != false {
		t.Errorf("request: %v", sent)
	}
	if _, ok := sent["format"].(map[string]any)["properties"]; !ok {
		t.Errorf("the schema should be sent as format")
	}
	msgs := sent["messages"].([]any)
	user := msgs[1].(map[string]any)
	if imgs := user["images"].([]any); len(imgs) != 1 || imgs[0] == "" {
		t.Errorf("the picture should be sent base64 in images: %v", user)
	}
	if !strings.Contains(msgs[0].(map[string]any)["content"].(string), "catalog") {
		t.Errorf("system prompt should describe the catalog")
	}
}

// Some thinking models leave the message empty and put the answer, tags and all,
// in the thinking field.
func TestOllamaAnswerInThinkingField(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"message": map[string]any{"role": "assistant", "content": "", "thinking": "<think>\nOk.\n```json\n" + sloppyReply + "\n```"}, "done": true, "done_reason": "stop"})
	}))
	defer srv.Close()
	d, err := NewOllama(srv.URL, "qwen3-vl:4b").Analyze(context.Background(), []byte("x"), "image/jpeg")
	if err != nil || d.Front != "hidden_placket" {
		t.Errorf("should read the answer from the thinking field: %v %+v", err, d)
	}
}

func TestOllamaErrorsAreReadable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":"model 'nope' not found"}`))
	}))
	defer srv.Close()
	_, err := NewOllama(srv.URL, "nope").Analyze(context.Background(), []byte("x"), "image/png")
	if err == nil || !strings.Contains(err.Error(), "not found") {
		t.Errorf("Ollama's own message should come through: %v", err)
	}
	if _, err := NewOllama("http://127.0.0.1:1", "m").Analyze(context.Background(), []byte("x"), "image/png"); err == nil {
		t.Errorf("an unreachable Ollama should be an error")
	}
}

func TestServicePicksAReader(t *testing.T) {
	ctx := context.Background()
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("ANTHROPIC_AUTH_TOKEN", "")
	t.Setenv("VISION_PROVIDER", "")

	// A running Ollama with a text-only model and two vision models: the newer
	// family wins, and its "thinking" is switched off.
	var chat map[string]any
	srv := fakeOllama(t, map[string][]string{"deepseek-r1:7b": {"completion"}, "gemma3:4b": {"completion", "vision"}, "qwen3-vl:4b": {"completion", "vision", "thinking"}}, sloppyReply, &chat)
	defer srv.Close()
	svc := NewService().WithReaders(NewAnalyzer(), NewOllama(srv.URL, ""))
	svc.OllamaModel = ""
	if st := svc.Status(ctx); st.Provider != "ollama" || st.Model != "qwen3-vl:4b" {
		t.Errorf("should find the best vision model, got %+v", st)
	}
	if d, err := svc.Analyze(ctx, []byte("x"), "image/jpeg"); err != nil || d.Provider != "ollama" {
		t.Errorf("should read with the local model: %v %+v", err, d)
	}
	if chat["think"] != false {
		t.Errorf("a thinking model should be told not to think: %v", chat["think"])
	}

	// A key takes priority.
	t.Setenv("ANTHROPIC_API_KEY", "sk-test")
	if st := svc.Status(ctx); st.Provider != "anthropic" {
		t.Errorf("a key should pick the Claude API, got %+v", st)
	}
	// Unless the local model is asked for.
	t.Setenv("VISION_PROVIDER", "ollama")
	if st := svc.Status(ctx); st.Provider != "ollama" {
		t.Errorf("VISION_PROVIDER=ollama should win, got %+v", st)
	}
	t.Setenv("ANTHROPIC_API_KEY", "")
	t.Setenv("VISION_PROVIDER", "")

	// Ollama up but no vision model: say which to pull.
	textOnly := fakeOllama(t, map[string][]string{"deepseek-r1:7b": {"completion"}}, "", nil)
	defer textOnly.Close()
	st := NewService().WithReaders(NewAnalyzer(), NewOllama(textOnly.URL, "")).Status(ctx)
	if st.Provider != "none" || !strings.Contains(st.Hint, "ollama pull") {
		t.Errorf("should tell the user what to pull: %+v", st)
	}
	if _, err := NewService().WithReaders(NewAnalyzer(), NewOllama(textOnly.URL, "")).Analyze(ctx, []byte("x"), "image/jpeg"); err == nil {
		t.Errorf("no reader should be an error")
	}

	// Nothing running at all.
	gone := NewService().WithReaders(NewAnalyzer(option.WithAPIKey("")), NewOllama("http://127.0.0.1:1", ""))
	if st := gone.Status(ctx); st.Provider != "none" || !strings.Contains(st.Hint, "ANTHROPIC_API_KEY") {
		t.Errorf("should explain both options: %+v", st)
	}

	// A wanted model that isn't installed is "none", not a silent other model.
	svc.OllamaModel = "llava:7b"
	if st := svc.Status(ctx); st.Provider != "none" || !strings.Contains(st.Hint, "llava:7b") {
		t.Errorf("a missing wanted model should be named: %+v", st)
	}
}
