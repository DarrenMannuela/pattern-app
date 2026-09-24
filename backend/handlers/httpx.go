package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"runtime/debug"
)

// Request body ceilings. Ordinary requests are small JSON; an order can also
// carry the picture a custom design is traced over, as a data URL.
const (
	maxBodyBytes      = 1 << 20
	maxOrderBodyBytes = 24 << 20
)

// readJSON decodes the request body into dst. On failure it has already
// answered the request (400 for a missing or malformed body, 413 for one over
// limit) and returns false. what names the payload in the message, e.g.
// "order payload".
func readJSON(w http.ResponseWriter, r *http.Request, dst any, limit int64, what string) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	err := json.NewDecoder(r.Body).Decode(dst)
	if err == nil {
		return true
	}
	var tooLarge *http.MaxBytesError
	switch {
	case errors.As(err, &tooLarge):
		http.Error(w, what+" is too large", http.StatusRequestEntityTooLarge)
	case errors.Is(err, io.EOF):
		http.Error(w, "empty request: expected "+what, http.StatusBadRequest)
	default:
		http.Error(w, "invalid "+what, http.StatusBadRequest)
	}
	return false
}

// writeJSON sends v as JSON. The body is encoded before anything is written,
// so a value that can't be encoded becomes a clean 500 instead of a 200 with
// a truncated body.
func writeJSON(w http.ResponseWriter, status int, v any) {
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(v); err != nil {
		log.Printf("handlers: encode response: %v", err)
		http.Error(w, "couldn't build the response", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(buf.Bytes())
}

// Recover turns a panic in a handler into a logged 500, so one bad request
// can't drop the connection without an answer (net/http would otherwise just
// close it, and the browser would report only "Failed to fetch").
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			rec := recover()
			if rec == nil || rec == http.ErrAbortHandler {
				if rec != nil {
					panic(rec)
				}
				return
			}
			log.Printf("panic serving %s %s: %v\n%s", r.Method, r.URL.Path, rec, debug.Stack())
			http.Error(w, "something went wrong on the server; the request was not completed", http.StatusInternalServerError)
		}()
		next.ServeHTTP(w, r)
	})
}
