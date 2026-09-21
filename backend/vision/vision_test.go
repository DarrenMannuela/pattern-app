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

const reply = `{"garment":"shirt","fit":"female","sleeve":"short","neckline":"band_collar","front":"hidden_placket","back":"plain","hem":"curved","trim":"contrast_trim","insert_panel":"side_panel","leg":"not_applicable","front_pocket":"not_applicable","back_pocket":"not_applicable","waist":"not_applicable","side_stripe":"none","skirt_style":"not_applicable","pockets":[{"segment":"left_chest","kind":"welt"}],"prints":[{"type":"embroidery","segment":"right_chest","description":"restaurant logo"}],"main_color":"#c8b79a","accent_color":"#c0392b","unsupported":["batik pattern fabric"],"summary":"A tailored short-sleeve shirt with a mandarin collar.","confidence":"high"}`

func fakeAPI(t *testing.T, got *map[string]any) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, got); err != nil {
			t.Errorf("request wasn't JSON: %v", err)
		}
		w.Header().Set("content-type", "application/json")
		out, _ := json.Marshal(map[string]any{
			"id": "msg_1", "type": "message", "role": "assistant", "model": Model,
			"stop_reason": "end_turn", "stop_sequence": nil,
			"content": []any{map[string]any{"type": "text", "text": reply}},
			"usage":   map[string]any{"input_tokens": 10, "output_tokens": 10},
		})
		_, _ = w.Write(out)
	}))
}

func TestAnalyzeReadsThePhoto(t *testing.T) {
	var sent map[string]any
	srv := fakeAPI(t, &sent)
	defer srv.Close()

	a := NewAnalyzer(option.WithBaseURL(srv.URL), option.WithAPIKey("test"), option.WithMaxRetries(0))
	d, err := a.Analyze(context.Background(), []byte("not really a jpeg"), "image/jpeg")
	if err != nil {
		t.Fatal(err)
	}
	if d.Neckline != "band_collar" || d.Front != "hidden_placket" || d.InsertPanel != "side_panel" || d.Trim != "contrast_trim" {
		t.Errorf("design not read: %+v", d)
	}
	if len(d.Pockets) != 1 || d.Pockets[0].Kind != "welt" || len(d.Prints) != 1 || d.Prints[0].Type != "embroidery" {
		t.Errorf("pockets/prints not read: %+v", d)
	}

	// The request carries the picture, the model, and the schema.
	if sent["model"] != Model {
		t.Errorf("model = %v", sent["model"])
	}
	msgs := sent["messages"].([]any)
	content := msgs[0].(map[string]any)["content"].([]any)
	first := content[0].(map[string]any)
	src := first["source"].(map[string]any)
	if first["type"] != "image" || src["media_type"] != "image/jpeg" || src["type"] != "base64" {
		t.Errorf("first block should be the base64 image: %v", first)
	}
	oc := sent["output_config"].(map[string]any)["format"].(map[string]any)
	if oc["type"] != "json_schema" {
		t.Errorf("structured output not requested: %v", oc)
	}
	props := oc["schema"].(map[string]any)["properties"].(map[string]any)
	for _, k := range []string{"neckline", "front", "insert_panel", "pockets", "prints", "unsupported"} {
		if _, ok := props[k]; !ok {
			t.Errorf("schema lacks %q", k)
		}
	}
	if sent["fallbacks"] != "default" {
		t.Errorf("refusal fallbacks should be requested: %v", sent["fallbacks"])
	}
	if !strings.Contains(sent["system"].([]any)[0].(map[string]any)["text"].(string), "catalog") {
		t.Errorf("system prompt should describe the catalog")
	}
}

func TestSchemaValuesAreTheMakersOptions(t *testing.T) {
	// Every neckline the model may return is one the maker (or the frontend's
	// mapping) handles; this pins the list.
	props := Schema()["properties"].(map[string]any)
	enum := props["neckline"].(map[string]any)["enum"].([]any)
	want := map[string]bool{"point_collar": true, "spread_collar": true, "peter_pan_collar": true, "band_collar": true, "polo_collar": true, "v_neck": true, "round_neck": true, "not_applicable": true}
	if len(enum) != len(want) {
		t.Fatalf("neckline choices changed: %v", enum)
	}
	for _, e := range enum {
		if !want[e.(string)] {
			t.Errorf("unexpected neckline %v", e)
		}
	}
	// All keys are required (strict structured outputs).
	if len(Schema()["required"].([]any)) != len(props) {
		t.Errorf("every property must be required")
	}
}

func TestUnsupportedPictureTypeIsRejected(t *testing.T) {
	if _, err := NewAnalyzer().Analyze(context.Background(), []byte("x"), "image/bmp"); err == nil {
		t.Errorf("a BMP should be rejected before any request is made")
	}
}
