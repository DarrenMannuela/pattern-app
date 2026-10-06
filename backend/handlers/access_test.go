package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func guarded(p AccessPolicy) http.Handler {
	return Protect(p, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
}

func ask(h http.Handler, method, host, origin string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/api/orders", nil)
	r.Host = host
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestOtherWebsitesAreRefused(t *testing.T) {
	h := guarded(NewAccessPolicy("", ""))
	for _, m := range []string{http.MethodGet, http.MethodPost, http.MethodDelete, http.MethodOptions} {
		w := ask(h, m, "localhost:8000", "https://evil.example")
		if w.Code != http.StatusForbidden {
			t.Errorf("%s from another website: %d, want 403", m, w.Code)
		}
		if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Errorf("%s from another website was granted CORS (%q)", m, got)
		}
	}
}

func TestTheAppItselfAndToolsAreAnswered(t *testing.T) {
	h := guarded(NewAccessPolicy("", ""))
	// The page served from the same address (Docker: nginx passes the Host on).
	if w := ask(h, http.MethodPost, "localhost:8000", "http://localhost:8000"); w.Code != http.StatusOK {
		t.Errorf("same origin: %d", w.Code)
	}
	// curl, the health check, scripts: no Origin at all.
	if w := ask(h, http.MethodGet, "127.0.0.1:8080", ""); w.Code != http.StatusOK {
		t.Errorf("no origin: %d", w.Code)
	}
	// The Vite dev server on another port, including its preflight.
	w := ask(h, http.MethodOptions, "localhost:8080", "http://localhost:5175")
	if w.Code != http.StatusNoContent || w.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5175" {
		t.Errorf("dev preflight: %d %q", w.Code, w.Header().Get("Access-Control-Allow-Origin"))
	}
	if w := ask(h, http.MethodPut, "localhost:8080", "http://localhost:5175"); w.Code != http.StatusOK {
		t.Errorf("dev request: %d", w.Code)
	}
}

func TestOnlyLocalHostNamesAreAnswered(t *testing.T) {
	h := guarded(NewAccessPolicy("", "konveksi-mac"))
	for host, want := range map[string]int{
		"localhost:8000":     http.StatusOK,
		"127.0.0.1:8080":     http.StatusOK,
		"[::1]:8000":         http.StatusOK,
		"192.168.1.20:8000":  http.StatusOK, // the shop's network
		"darrens-mac.local":  http.StatusOK,
		"konveksi-mac:8000":  http.StatusOK, // named in ALLOWED_HOSTS
		"attacker.example":   http.StatusMisdirectedRequest,
		"evil.com:8000":      http.StatusMisdirectedRequest,
		"localhost.evil.com": http.StatusMisdirectedRequest,
		"":                   http.StatusMisdirectedRequest,
	} {
		if w := ask(h, http.MethodGet, host, ""); w.Code != want {
			t.Errorf("Host %q: %d, want %d", host, w.Code, want)
		}
	}
}

func TestExtraOriginsCanBeAllowed(t *testing.T) {
	h := guarded(NewAccessPolicy("https://studio.example/ , http://10.0.0.5:3000", ""))
	if w := ask(h, http.MethodGet, "localhost:8000", "https://studio.example"); w.Code != http.StatusOK {
		t.Errorf("configured origin: %d", w.Code)
	}
	if w := ask(h, http.MethodGet, "localhost:8000", "http://10.0.0.5:3000"); w.Code != http.StatusOK {
		t.Errorf("configured origin with port: %d", w.Code)
	}
}
