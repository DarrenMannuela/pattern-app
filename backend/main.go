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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
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
	ordersAPI := handlers.NewOrdersAPI("orders.json")
	mux := http.NewServeMux()

	// Orders: the primary workflow (customer -> garment type -> size
	// chart -> mockup revisions).
	mux.HandleFunc("/api/orders", cors(ordersAPI.List))
	mux.HandleFunc("/api/orders/{id}", cors(ordersAPI.ByID))
	mux.HandleFunc("/api/orders/{id}/mockups", cors(ordersAPI.CreateMockup))
	mux.HandleFunc("/api/orders/{id}/mockups/{version}", cors(ordersAPI.MockupByVersion))
	mux.HandleFunc("/api/fabrics", cors(handlers.Fabrics))

	// Cutting layout: unchanged, fed either by an order's mockup
	// pieces or pieces added by hand.
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

	// Lower-level drafting primitives: still used internally by the
	// orders package, and kept exposed as a "start from a standard
	// chart" convenience for the size-chart editor.
	mux.HandleFunc("/api/draft", cors(handlers.Draft))
	mux.HandleFunc("/api/grade", cors(handlers.Grade))
	mux.HandleFunc("/api/grade-child", cors(handlers.GradeChild))

	addr := ":8080"
	log.Printf("pattern-app backend listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
