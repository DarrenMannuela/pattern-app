package vision

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/anthropics/anthropic-sdk-go/option"
)

// brokenClaude answers every request with a server error, the way an outage would.
func brokenClaude(t *testing.T) *Analyzer {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"type":"error","error":{"type":"api_error","message":"overloaded"}}`, http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)
	return NewAnalyzer(option.WithBaseURL(srv.URL), option.WithAPIKey("test-key"), option.WithMaxRetries(0))
}

func localModel(t *testing.T) *Ollama {
	t.Helper()
	srv := fakeOllama(t, map[string][]string{"qwen2.5vl:3b": {"completion", "vision"}}, sloppyReply, nil)
	t.Cleanup(srv.Close)
	return NewOllama(srv.URL, "")
}

func noOllama() *Ollama { return NewOllama("http://127.0.0.1:1", "") }

func TestClaudeFailureFallsBackToTheLocalModel(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	t.Setenv("VISION_PROVIDER", "")
	svc := NewService().WithReaders(brokenClaude(t), localModel(t))

	d, err := svc.Analyze(context.Background(), []byte("jpeg"), "image/jpeg")
	if err != nil {
		t.Fatalf("expected the local model to step in, got %v", err)
	}
	if d.Provider != "ollama" || d.Fallback == "" {
		t.Errorf("should be a local read that says why: %+v", d)
	}
	if !strings.Contains(d.Fallback, "Claude API") || !strings.Contains(d.Fallback, "qwen2.5vl:3b") {
		t.Errorf("fallback note should name both readers: %q", d.Fallback)
	}

	d, err = svc.AnalyzeText(context.Background(), "kemeja krem")
	if err != nil || d.Provider != "ollama" || d.Fallback == "" {
		t.Errorf("text reads fall back too: %+v %v", d, err)
	}
}

func TestNoFallbackWhenClaudeIsForced(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	t.Setenv("VISION_PROVIDER", "anthropic")
	svc := NewService().WithReaders(brokenClaude(t), localModel(t))
	if _, err := svc.Analyze(context.Background(), []byte("jpeg"), "image/jpeg"); err == nil {
		t.Fatal("VISION_PROVIDER=anthropic asked for Claude only")
	}
}

func TestClaudeFailureWithoutALocalModelKeepsTheClaudeError(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	t.Setenv("VISION_PROVIDER", "")
	svc := NewService().WithReaders(brokenClaude(t), noOllama())
	_, err := svc.Analyze(context.Background(), []byte("jpeg"), "image/jpeg")
	if err == nil || !strings.Contains(err.Error(), "overloaded") {
		t.Errorf("the Claude error should come through: %v", err)
	}
}

func TestBothReadersFailingReportsBoth(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	t.Setenv("VISION_PROVIDER", "")
	badLocal := fakeOllama(t, map[string][]string{"qwen2.5vl:3b": {"completion", "vision"}}, "not json at all", nil)
	defer badLocal.Close()
	svc := NewService().WithReaders(brokenClaude(t), NewOllama(badLocal.URL, ""))
	_, err := svc.Analyze(context.Background(), []byte("jpeg"), "image/jpeg")
	if err == nil || !strings.Contains(err.Error(), "overloaded") || !strings.Contains(err.Error(), "local model") {
		t.Errorf("both failures should be in the message: %v", err)
	}
}

// A person cancelling the request isn't a Claude failure.
func TestCancelledRequestDoesNotFallBack(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	t.Setenv("VISION_PROVIDER", "")
	hit := false
	local := fakeOllama(t, map[string][]string{"qwen2.5vl:3b": {"completion", "vision"}}, sloppyReply, nil)
	defer local.Close()
	counting := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/chat" {
			hit = true
		}
		http.Redirect(w, r, local.URL+r.URL.Path, http.StatusTemporaryRedirect)
	}))
	defer counting.Close()
	svc := NewService().WithReaders(brokenClaude(t), NewOllama(counting.URL, ""))

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := svc.Analyze(ctx, []byte("jpeg"), "image/jpeg"); err == nil {
		t.Error("expected an error")
	}
	if hit {
		t.Error("the local model was asked to read after the request was cancelled")
	}
}
