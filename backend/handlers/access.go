package handlers

import (
	"net"
	"net/http"
	"net/url"
	"strings"
)

// AccessPolicy decides who the API answers. The app has no login, so it must
// not answer just anyone: any website open in the same browser could
// otherwise read the orders (names, contacts, photos), delete them, or spend
// Claude credits reading photos.
//
//   - Other websites: a browser marks every cross-site request with its
//     Origin. The API answers only the app's own page (same origin) and the
//     development servers in AllowedOrigins.
//   - DNS rebinding: a website can point its own domain at this computer and
//     then ask "same origin". The Host it asks with is that domain, so only
//     hosts that can't be an outsider's domain are answered: this computer
//     (localhost), an IP address, a .local network name, and AllowedHosts.
type AccessPolicy struct {
	AllowedOrigins map[string]bool // exact origins, e.g. "http://localhost:5175"
	AllowedHosts   map[string]bool // extra host names, lower case, no port; "*" allows any
}

// DevOrigins are the Vite servers used in development (dev and preview).
var DevOrigins = []string{
	"http://localhost:5173", "http://127.0.0.1:5173",
	"http://localhost:5175", "http://127.0.0.1:5175",
	"http://localhost:4173", "http://127.0.0.1:4173",
}

// NewAccessPolicy builds the policy from the development origins plus the
// comma-separated extra origins and hosts (the CORS_ORIGINS and ALLOWED_HOSTS
// settings).
func NewAccessPolicy(extraOrigins, extraHosts string) AccessPolicy {
	p := AccessPolicy{AllowedOrigins: map[string]bool{}, AllowedHosts: map[string]bool{}}
	for _, o := range DevOrigins {
		p.AllowedOrigins[o] = true
	}
	for _, o := range splitList(extraOrigins) {
		p.AllowedOrigins[strings.TrimRight(o, "/")] = true
	}
	for _, h := range splitList(extraHosts) {
		p.AllowedHosts[strings.ToLower(h)] = true
	}
	return p
}

func splitList(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}

// hostName is the host of a Host header, without its port or IPv6 brackets.
func hostName(host string) string {
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return strings.ToLower(strings.Trim(host, "[]"))
}

func (p AccessPolicy) hostOK(host string) bool {
	h := hostName(host)
	switch {
	case h == "":
		return false
	case net.ParseIP(h) != nil: // an address typed in can't be someone else's domain
		return true
	case h == "localhost", strings.HasSuffix(h, ".localhost"), strings.HasSuffix(h, ".local"):
		return true
	}
	return p.AllowedHosts[h] || p.AllowedHosts["*"]
}

// sameOrigin reports whether origin is the address the request was made to.
func sameOrigin(origin, host string) bool {
	u, err := url.Parse(origin)
	return err == nil && u.Host != "" && strings.EqualFold(u.Host, host)
}

// Protect answers only what p allows, and lets the allowed development
// origins call the API across origins.
func Protect(p AccessPolicy, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !p.hostOK(r.Host) {
			http.Error(w, "This server answers only on this computer or its own network address.", http.StatusMisdirectedRequest)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" && !sameOrigin(origin, r.Host) {
			w.Header().Add("Vary", "Origin")
			if !p.AllowedOrigins[origin] {
				http.Error(w, "Requests from other websites are not allowed.", http.StatusForbidden)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
