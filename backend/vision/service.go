package vision

import (
	"context"
	"errors"
	"os"
)

// Status says who would read a photo right now.
type Status struct {
	// Provider is "anthropic", "ollama" or "none".
	Provider string `json:"provider"`
	Model    string `json:"model,omitempty"`
	// Hint tells the user how to turn photo reading on when Provider is "none".
	Hint string `json:"hint,omitempty"`
}

// ErrNoReader is returned when nothing is set up to read photos.
var ErrNoReader = errors.New("no photo reader is set up")

const noReaderHint = "Automatic part matching is off. Either run a local vision model (free, offline): install Ollama and run `ollama pull " + SuggestedLocalModel + "`, or set ANTHROPIC_API_KEY for the Claude API and restart the backend. You can always match by eye with the photo beside the preview."

// Service reads photos with whichever reader is available. VISION_PROVIDER
// ("anthropic" or "ollama") forces one; otherwise a Claude API key is used when
// there is one, else a vision model found in a running Ollama.
type Service struct {
	claude *Analyzer
	ollama *Ollama
	// OllamaModel, when set (OLLAMA_VISION_MODEL), is the local model to use.
	OllamaModel string
}

// NewService builds a service from the environment (OLLAMA_HOST,
// OLLAMA_VISION_MODEL, VISION_PROVIDER, ANTHROPIC_API_KEY).
func NewService() *Service {
	return &Service{
		claude:      NewAnalyzer(),
		ollama:      NewOllama(os.Getenv("OLLAMA_HOST"), ""),
		OllamaModel: os.Getenv("OLLAMA_VISION_MODEL"),
	}
}

// WithReaders swaps the underlying readers (tests point them at fake servers).
func (s *Service) WithReaders(claude *Analyzer, ollama *Ollama) *Service {
	s.claude, s.ollama = claude, ollama
	return s
}

func claudeConfigured() bool {
	return os.Getenv("ANTHROPIC_API_KEY") != "" || os.Getenv("ANTHROPIC_AUTH_TOKEN") != ""
}

// reader picks the reader for now.
func (s *Service) reader(ctx context.Context) (interface {
	Analyze(context.Context, []byte, string) (*Design, error)
}, Status) {
	force := os.Getenv("VISION_PROVIDER")
	if force != "ollama" && claudeConfigured() {
		return s.claude, Status{Provider: "anthropic", Model: Model}
	}
	if force == "anthropic" {
		return nil, Status{Provider: "none", Hint: "VISION_PROVIDER is anthropic but no ANTHROPIC_API_KEY is set."}
	}
	model, thinking, err := s.ollama.visionModel(ctx, s.OllamaModel)
	if err != nil {
		return nil, Status{Provider: "none", Hint: noReaderHint}
	}
	if model == "" {
		want := s.OllamaModel
		if want == "" {
			want = SuggestedLocalModel
		}
		return nil, Status{Provider: "none", Hint: "Ollama is running but has no vision model. Run `ollama pull " + want + "` (about 3GB), then try again. Or set ANTHROPIC_API_KEY for the Claude API."}
	}
	local := *s.ollama
	local.Model, local.Thinking = model, thinking
	return &local, Status{Provider: "ollama", Model: model}
}

// Status reports which reader would be used.
func (s *Service) Status(ctx context.Context) Status {
	_, st := s.reader(ctx)
	return st
}

// Analyze reads a photo with the available reader.
func (s *Service) Analyze(ctx context.Context, img []byte, mediaType string) (*Design, error) {
	r, st := s.reader(ctx)
	if r == nil {
		return nil, errors.New(st.Hint)
	}
	return r.Analyze(ctx, img, mediaType)
}

// Available reports whether any reader is set up.
func (s *Service) Available(ctx context.Context) (Status, bool) {
	st := s.Status(ctx)
	return st, st.Provider != "none"
}
