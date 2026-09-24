package vision

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
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

// designReader is what reads a design: a picture or a written description.
type designReader interface {
	Analyze(ctx context.Context, img []byte, mediaType string) (*Design, error)
	AnalyzeText(ctx context.Context, description string) (*Design, error)
}

// claudeTimeout bounds one Claude API attempt, so a stalled API hands over to
// the local model in a reasonable time instead of after the SDK's own, much
// longer, timeout.
const claudeTimeout = 90 * time.Second

// reader picks the reader for now.
func (s *Service) reader(ctx context.Context) (designReader, Status) {
	force := os.Getenv("VISION_PROVIDER")
	if force != "ollama" && claudeConfigured() {
		return s.claude, Status{Provider: "anthropic", Model: Model}
	}
	if force == "anthropic" {
		return nil, Status{Provider: "none", Hint: "VISION_PROVIDER is anthropic but no ANTHROPIC_API_KEY is set."}
	}
	return s.localReader(ctx)
}

// localReader is the vision model found in a running Ollama, if there is one.
func (s *Service) localReader(ctx context.Context) (designReader, Status) {
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

// read runs one read with the available reader. When that is the Claude API
// and it fails (no network, a rate limit, a bad key, a stall), a local model
// takes over if one is running: it is free and keeps the picture on this
// computer, so falling back never sends anything anywhere new. Forcing
// VISION_PROVIDER=anthropic turns the fallback off.
func (s *Service) read(ctx context.Context, run func(context.Context, designReader) (*Design, error)) (*Design, error) {
	r, st := s.reader(ctx)
	if r == nil {
		return nil, errors.New(st.Hint)
	}
	if st.Provider != "anthropic" {
		return run(ctx, r)
	}

	attempt, cancel := context.WithTimeout(ctx, claudeTimeout)
	defer cancel()
	design, err := run(attempt, r)
	if err == nil {
		return design, nil
	}
	if ctx.Err() != nil || os.Getenv("VISION_PROVIDER") == "anthropic" {
		return nil, err
	}
	local, localStatus := s.localReader(ctx)
	if local == nil {
		return nil, err
	}
	design, localErr := run(ctx, local)
	if localErr != nil {
		return nil, fmt.Errorf("%w (the local model was tried next and failed too: %s)", err, brief(localErr))
	}
	design.Fallback = fmt.Sprintf("The Claude API couldn't be used (%s), so the local model %s read it instead.", brief(err), localStatus.Model)
	return design, nil
}

// brief is an error's first stretch on one line, for showing to a person.
func brief(err error) string {
	msg := []rune(strings.Join(strings.Fields(err.Error()), " "))
	if len(msg) > 120 {
		return string(msg[:120]) + "…"
	}
	return string(msg)
}

// Analyze reads a photo with the available reader.
func (s *Service) Analyze(ctx context.Context, img []byte, mediaType string) (*Design, error) {
	return s.read(ctx, func(ctx context.Context, r designReader) (*Design, error) {
		return r.Analyze(ctx, img, mediaType)
	})
}

// AnalyzeText turns a written description into a first-draft design with the
// available reader.
func (s *Service) AnalyzeText(ctx context.Context, description string) (*Design, error) {
	return s.read(ctx, func(ctx context.Context, r designReader) (*Design, error) {
		return r.AnalyzeText(ctx, description)
	})
}

// Available reports whether any reader is set up.
func (s *Service) Available(ctx context.Context) (Status, bool) {
	st := s.Status(ctx)
	return st, st.Provider != "none"
}
