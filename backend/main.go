package main

import (
	"log"
	"net/http"
	"strings"

	"patternapp/backend/handlers"
)

// cors wraps a handler so the Vite dev server (a different origin)
// can call this API during local development.
func cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func main() {
	store := handlers.NewStore()
	mux := http.NewServeMux()

	mux.HandleFunc("/api/pieces", cors(store.Pieces))
	mux.HandleFunc("/api/pieces/", cors(func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/pieces/")
		if id == "" {
			http.NotFound(w, r)
			return
		}
		store.PieceByID(w, r, id)
	}))
	mux.HandleFunc("/api/pack", cors(store.Pack))
	mux.HandleFunc("/api/draft", cors(handlers.Draft))

	addr := ":8080"
	log.Printf("pattern-app backend listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
