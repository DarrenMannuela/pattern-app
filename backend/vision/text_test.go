package vision

import (
	"context"
	"strings"
	"testing"

	"github.com/anthropics/anthropic-sdk-go/option"
)

// The text prompt shares the catalog vocabulary with the photo prompt and swaps
// only the rules that assume a picture is in front of you.
func TestTextPromptSwapsOnlyThePictureRules(t *testing.T) {
	text := textRules()
	if len(text) != len(catalogRules) {
		t.Fatalf("text rules dropped or added a rule: %d vs %d", len(text), len(catalogRules))
	}
	var changed []string
	for i := range text {
		if text[i] != catalogRules[i] {
			changed = append(changed, strings.SplitN(catalogRules[i], ":", 2)[0])
		}
	}
	if len(changed) != 5 {
		t.Fatalf("expected exactly five swapped rules (sleeve, motifs, pockets, colours, unsupported), got %v", changed)
	}

	// Nothing in the text prompt tells the model to look at a picture.
	for _, phrase := range []string{"photograph", "you can see", "clearly see"} {
		if strings.Contains(textSystemPrompt, phrase) {
			t.Errorf("text prompt still talks about a picture: %q", phrase)
		}
	}
	// ...and the photo prompt is left as it was tuned.
	if !strings.Contains(systemPrompt, "photographs of uniforms") {
		t.Errorf("photo prompt changed")
	}
	// Both share the catalog rules the pattern maker depends on.
	for _, shared := range []string{"- garment:", "- neckline:", "- trim:", "- insert_panel:"} {
		if !strings.Contains(textSystemPrompt, shared) || !strings.Contains(systemPrompt, shared) {
			t.Errorf("shared rule %q missing from a prompt", shared)
		}
	}
}

func TestOllamaReadsAWrittenDescription(t *testing.T) {
	var sent map[string]any
	srv := fakeOllama(t, map[string][]string{"qwen2.5vl:3b": {"completion", "vision"}}, sloppyReply, &sent)
	defer srv.Close()

	o := NewOllama(srv.URL, "qwen2.5vl:3b")
	d, err := o.AnalyzeText(context.Background(), "kemeja pendek warna krem, kerah tegak, saku dada")
	if err != nil {
		t.Fatal(err)
	}
	// Same normalisation and confidence cap as a photo read.
	if d.Provider != "ollama" || d.Garment != "shirt" || d.MainColor != "#c8b79a" || d.Confidence != "medium" {
		t.Errorf("design not normalised: %+v", d)
	}

	msgs := sent["messages"].([]any)
	sys := msgs[0].(map[string]any)["content"].(string)
	user := msgs[1].(map[string]any)
	if sys != textSystemPrompt {
		t.Errorf("a description should be read with the text prompt")
	}
	if user["content"] != "kemeja pendek warna krem, kerah tegak, saku dada" {
		t.Errorf("the customer's words should go through untouched: %v", user["content"])
	}
	if _, has := user["images"]; has {
		t.Errorf("a description has no picture to send")
	}
	if _, ok := sent["format"].(map[string]any)["properties"]; !ok {
		t.Errorf("the schema should still be sent as format")
	}
}

func TestClaudeReadsAWrittenDescription(t *testing.T) {
	var sent map[string]any
	srv := fakeAPI(t, &sent)
	defer srv.Close()

	a := NewAnalyzer(option.WithBaseURL(srv.URL), option.WithAPIKey("test"), option.WithMaxRetries(0))
	d, err := a.AnalyzeText(context.Background(), "short-sleeve cream shirt with a band collar")
	if err != nil {
		t.Fatal(err)
	}
	if d.Provider != "anthropic" || d.Neckline != "band_collar" {
		t.Errorf("design not read: %+v", d)
	}
	content := sent["messages"].([]any)[0].(map[string]any)["content"].([]any)
	if len(content) != 1 || content[0].(map[string]any)["type"] != "text" || content[0].(map[string]any)["text"] != "short-sleeve cream shirt with a band collar" {
		t.Errorf("the only block should be the description as text: %v", content)
	}
	if sys := sent["system"].([]any)[0].(map[string]any)["text"].(string); sys != textSystemPrompt {
		t.Errorf("a description should be read with the text prompt")
	}
}
