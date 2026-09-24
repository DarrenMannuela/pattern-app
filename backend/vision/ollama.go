package vision

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// SuggestedLocalModel is a small vision model that fits in 8GB of memory.
const SuggestedLocalModel = "qwen3-vl:4b"

// DefaultOllamaHost is where Ollama listens on this machine.
const DefaultOllamaHost = "http://localhost:11434"

// visionFamilies are the vision models worth trying first, best first.
var visionFamilies = []string{"qwen3-vl", "qwen2.5vl", "gemma4", "gemma3", "llama3.2-vision", "minicpm-v", "granite3.2-vision", "llava", "moondream"}

// Ollama reads photos with a vision model running under Ollama on this machine,
// which needs no key and sends the picture nowhere.
type Ollama struct {
	Host  string
	Model string
	// Thinking is set when the model can "think" before answering; that is
	// turned off, since it only makes a picture description slower.
	Thinking bool
	http     *http.Client
}

// NewOllama builds a reader for host (DefaultOllamaHost when empty) and model.
func NewOllama(host, model string) *Ollama {
	if host == "" {
		host = DefaultOllamaHost
	}
	// A small model on a laptop can take a minute or two.
	return &Ollama{Host: strings.TrimRight(host, "/"), Model: model, http: &http.Client{Timeout: 6 * time.Minute}}
}

func (o *Ollama) post(ctx context.Context, path string, body any, out any) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, o.Host+path, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := o.http.Do(req)
	if err != nil {
		return fmt.Errorf("couldn't reach Ollama at %s: %w", o.Host, err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if res.StatusCode >= 300 {
		var e struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(data, &e) == nil && e.Error != "" {
			return errors.New("Ollama: " + e.Error)
		}
		return fmt.Errorf("Ollama answered %d", res.StatusCode)
	}
	return json.Unmarshal(data, out)
}

// Analyze describes the garment in an image with the local model.
func (o *Ollama) Analyze(ctx context.Context, img []byte, mediaType string) (*Design, error) {
	switch mediaType {
	case "image/jpeg", "image/png", "image/gif", "image/webp":
	default:
		return nil, fmt.Errorf("unsupported picture type %q (use JPEG, PNG, GIF or WebP)", mediaType)
	}
	return o.describe(ctx, systemPrompt, "Describe this uniform in the catalog's terms.", []string{base64.StdEncoding.EncodeToString(img)})
}

// AnalyzeText turns a customer's written description into a first-draft design
// with the local model — no picture, so it runs faster than reading a photo.
func (o *Ollama) AnalyzeText(ctx context.Context, description string) (*Design, error) {
	return o.describe(ctx, textSystemPrompt, description, nil)
}

// describe sends one chat — the system prompt and the user's words (plus any
// pictures) — and reads the design back.
func (o *Ollama) describe(ctx context.Context, system, user string, images []string) (*Design, error) {
	var res struct {
		Message struct {
			Content string `json:"content"`
			// Some thinking models put the whole answer here even with thinking off.
			Thinking string `json:"thinking"`
		} `json:"message"`
		DoneReason string `json:"done_reason"`
	}
	userMsg := map[string]any{"role": "user", "content": user}
	if len(images) > 0 {
		userMsg["images"] = images
	}
	body := map[string]any{
		"model":  o.Model,
		"stream": false,
		"format": Schema(),
		// Deterministic, and a context big enough for the picture and the answer.
		"options":  map[string]any{"temperature": 0, "num_ctx": 4096, "num_predict": 900},
		"messages": []map[string]any{{"role": "system", "content": system}, userMsg},
	}
	if o.Thinking {
		body["think"] = false
	}
	err := o.post(ctx, "/api/chat", body, &res)
	if err != nil {
		return nil, err
	}
	if res.DoneReason == "length" {
		return nil, errors.New("the local model's description was cut off; try again")
	}
	answer := res.Message.Content
	if strings.TrimSpace(answer) == "" {
		answer = res.Message.Thinking
	}
	var d Design
	if err := json.Unmarshal([]byte(extractJSON(answer)), &d); err != nil {
		return nil, fmt.Errorf("couldn't read the local model's answer (%d characters): %w", len(answer), err)
	}
	d.Normalize()
	// A small model is a first guess, whatever it says about itself.
	if d.Confidence == "high" {
		d.Confidence = "medium"
	}
	d.Provider, d.Model = "ollama", o.Model
	return &d, nil
}

// visionModel finds a model on the server that can read pictures: the wanted one
// when set, else the first vision-capable model, best families first. It returns
// "" when Ollama is up but has none.
func (o *Ollama) visionModel(ctx context.Context, wanted string) (model string, thinking bool, err error) {
	var tags struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, o.Host+"/api/tags", nil)
	if err != nil {
		return "", false, err
	}
	res, err := (&http.Client{Timeout: 2 * time.Second}).Do(req)
	if err != nil {
		return "", false, err
	}
	defer res.Body.Close()
	if err := json.NewDecoder(res.Body).Decode(&tags); err != nil {
		return "", false, err
	}
	capabilities := func(n string) []string {
		var show struct {
			Capabilities []string `json:"capabilities"`
		}
		if o.post(ctx, "/api/show", map[string]any{"model": n}, &show) != nil {
			return nil
		}
		return show.Capabilities
	}
	has := func(caps []string, c string) bool {
		for _, x := range caps {
			if x == c {
				return true
			}
		}
		return false
	}
	names := make([]string, 0, len(tags.Models))
	for _, m := range tags.Models {
		names = append(names, m.Name)
	}
	if wanted != "" {
		for _, n := range names {
			if n == wanted || n == wanted+":latest" {
				return n, has(capabilities(n), "thinking"), nil
			}
		}
		return "", false, nil
	}
	rank := func(n string) int {
		for i, f := range visionFamilies {
			if strings.HasPrefix(n, f) {
				return i
			}
		}
		return len(visionFamilies)
	}
	for r := 0; r <= len(visionFamilies); r++ {
		for _, n := range names {
			if rank(n) != r {
				continue
			}
			if caps := capabilities(n); has(caps, "vision") {
				return n, has(caps, "thinking"), nil
			}
		}
	}
	return "", false, nil
}

// extractJSON returns the JSON object in an answer that may carry <think> tags
// or a code fence around it.
func extractJSON(s string) string {
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start < 0 || end < start {
		return s
	}
	return s[start : end+1]
}
