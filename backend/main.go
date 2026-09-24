package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"patternapp/backend/handlers"
	"patternapp/backend/vision"
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
	ordersAPI, err := handlers.NewOrdersAPI(ordersFile())
	if err != nil {
		log.Fatalf("can't open the orders file: %v", err)
	}
	mux := http.NewServeMux()

	// Orders: the primary workflow (customer -> garment type -> size
	// chart -> mockup revisions).
	mux.HandleFunc("/api/orders", cors(ordersAPI.List))
	mux.HandleFunc("/api/orders/{id}", cors(ordersAPI.ByID))
	mux.HandleFunc("/api/orders/{id}/preview", cors(ordersAPI.Preview))
	mux.HandleFunc("/api/orders/{id}/mockups", cors(ordersAPI.CreateMockup))
	mux.HandleFunc("/api/orders/{id}/cutting-plan", cors(ordersAPI.CuttingPlan))
	mux.HandleFunc("/api/orders/{id}/mockups/{version}", cors(ordersAPI.MockupByVersion))
	mux.HandleFunc("/api/fabrics", cors(handlers.Fabrics))
	photos := vision.NewService()
	mux.HandleFunc("/api/analyze-photo", cors(handlers.AnalyzePhoto(photos)))
	mux.HandleFunc("/api/analyze-photo/status", cors(handlers.PhotoStatus(photos)))
	mux.HandleFunc("/api/analyze-text", cors(handlers.AnalyzeText(photos)))

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
	if port := os.Getenv("PORT"); port != "" {
		addr = ":" + port
	}
	// No overall write timeout: reading a photo with a local model can
	// legitimately take minutes. The read side is bounded so a stalled client
	// can't hold a connection open.
	srv := &http.Server{
		Addr:              addr,
		Handler:           handlers.Recover(mux),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       2 * time.Minute,
		IdleTimeout:       2 * time.Minute,
	}

	stop, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	go func() {
		<-stop.Done()
		// Let requests already running (a save in progress) finish before exiting.
		ctx, done := context.WithTimeout(context.Background(), 10*time.Second)
		defer done()
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("shutdown: %v", err)
		}
	}()

	log.Printf("pattern-app backend listening on %s", addr)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

// ordersFile is where orders are kept: ORDERS_FILE if set, else orders.json in
// the directory the backend runs from.
func ordersFile() string {
	if p := os.Getenv("ORDERS_FILE"); p != "" {
		return p
	}
	return "orders.json"
}
