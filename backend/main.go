package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"patternapp/backend/handlers"
	"patternapp/backend/orders"
	"patternapp/backend/pgstore"
	"patternapp/backend/vision"
)

func main() {
	store, ordersAPI, artworkAPI, health := openStorage()
	// Who the API answers: the app's own page, the dev servers, and only on
	// this computer's own names and addresses (see handlers.AccessPolicy).
	access := handlers.NewAccessPolicy(os.Getenv("CORS_ORIGINS"), os.Getenv("ALLOWED_HOSTS"))
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", health)
	mux.HandleFunc("/api/backups", handlers.BackupStatus(os.Getenv("BACKUP_DIR"), os.Getenv("BACKUP_WARN_DAYS")))

	// Orders: the primary workflow (customer -> garment type -> size
	// chart -> mockup revisions).
	mux.HandleFunc("/api/orders", ordersAPI.List)
	mux.HandleFunc("/api/orders/{id}", ordersAPI.ByID)
	mux.HandleFunc("/api/orders/{id}/preview", ordersAPI.Preview)
	mux.HandleFunc("/api/orders/{id}/mockups", ordersAPI.CreateMockup)
	mux.HandleFunc("/api/orders/{id}/cutting-plan", ordersAPI.CuttingPlan)
	mux.HandleFunc("/api/orders/{id}/mockups/{version}", ordersAPI.MockupByVersion)
	mux.HandleFunc("/api/fabrics", handlers.Fabrics)
	// Logos and pictures for embroidery and sablon.
	mux.HandleFunc("/api/artwork", artworkAPI.Upload)
	mux.HandleFunc("/api/artwork/{id}", artworkAPI.Get)
	photos := vision.NewService()
	mux.HandleFunc("/api/analyze-photo", handlers.AnalyzePhoto(photos))
	mux.HandleFunc("/api/analyze-photo/status", handlers.PhotoStatus(photos))
	mux.HandleFunc("/api/analyze-text", handlers.AnalyzeText(photos))

	// Cutting layout: unchanged, fed either by an order's mockup
	// pieces or pieces added by hand.
	mux.HandleFunc("/api/pieces", store.Pieces)
	mux.HandleFunc("/api/pieces/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/pieces/")
		if id == "" {
			http.NotFound(w, r)
			return
		}
		store.PieceByID(w, r, id)
	})
	mux.HandleFunc("/api/pack", store.Pack)

	// Lower-level drafting primitives: still used internally by the
	// orders package, and kept exposed as a "start from a standard
	// chart" convenience for the size-chart editor.
	mux.HandleFunc("/api/draft", handlers.Draft)
	mux.HandleFunc("/api/grade", handlers.Grade)
	mux.HandleFunc("/api/grade-child", handlers.GradeChild)

	addr := ":8080"
	if port := os.Getenv("PORT"); port != "" {
		addr = ":" + port
	}
	// No overall write timeout: reading a photo with a local model can
	// legitimately take minutes. The read side is bounded so a stalled client
	// can't hold a connection open.
	srv := &http.Server{
		Addr:              addr,
		Handler:           handlers.LogProblems(3*time.Second, handlers.Recover(handlers.Protect(access, mux))),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       2 * time.Minute,
		IdleTimeout:       2 * time.Minute,
	}

	stop, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	// Closed once the last requests have finished and storage is closed.
	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		<-stop.Done()
		// Let requests already running (a save in progress) finish before exiting.
		ctx, done := context.WithTimeout(context.Background(), 10*time.Second)
		defer done()
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("shutdown: %v", err)
		}
		closeStorage()
	}()

	log.Printf("pattern-app backend listening on %s", addr)
	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	// ListenAndServe returns as soon as shutting down starts: wait for the
	// requests still running, or a save in progress would be cut off.
	<-stopped
	log.Printf("stopped cleanly")
}

// openStorage opens where the data is kept: PostgreSQL when DATABASE_URL is
// set (the Docker setup), else the orders file and the logo folder beside
// the backend, with the Cutting Layout pieces in memory. It also returns the
// health check, which reports which one is in use and whether it answers.
// closeStorage releases what openStorage opened (the database connections),
// once the server has finished its last requests.
var closeStorage = func() {}

func openStorage() (*handlers.Store, *handlers.OrdersAPI, *handlers.ArtworkAPI, http.HandlerFunc) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		ordersAPI, err := handlers.NewOrdersAPI(ordersFile())
		if err != nil {
			log.Fatalf("can't open the orders file: %v", err)
		}
		artworkAPI, err := handlers.NewArtworkAPI(artworkDir())
		if err != nil {
			log.Fatalf("can't open the artwork folder: %v", err)
		}
		log.Printf("storage: orders in %s, logos in %s (set DATABASE_URL to use PostgreSQL)", ordersFile(), artworkDir())
		return handlers.NewStore(), ordersAPI, artworkAPI, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"ok":true,"storage":"file"}` + "\n"))
		}
	}

	db, err := pgstore.Open(context.Background(), url, 90*time.Second)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	closeStorage = db.Close
	orderStore, err := orders.NewStoreWith(db.Orders())
	if err != nil {
		log.Fatalf("database: load orders: %v", err)
	}
	// The first start on a new database brings in what the backend kept
	// before it had one: the orders file and the logo folder. Only a database
	// that has never held an order counts as new, so deleting every order
	// never brings the old ones back.
	if highest, err := db.HighestOrderID(); err != nil {
		log.Fatalf("database: %v", err)
	} else if highest == 0 {
		if dir := os.Getenv("IMPORT_DIR"); dir != "" {
			importOldData(db, dir)
			if orderStore, err = orders.NewStoreWith(db.Orders()); err != nil {
				log.Fatalf("database: load orders: %v", err)
			}
		}
	}
	pieces, err := handlers.NewStoreWith(db)
	if err != nil {
		log.Fatalf("database: load layout pieces: %v", err)
	}
	log.Printf("storage: PostgreSQL (%d orders)", orderStore.Len())
	return pieces, handlers.NewOrdersAPIWith(orderStore), handlers.NewArtworkAPIWith(db.Artwork()), func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		w.Header().Set("Content-Type", "application/json")
		if err := db.Ping(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte(`{"ok":false,"storage":"postgres"}` + "\n"))
			return
		}
		w.Write([]byte(`{"ok":true,"storage":"postgres"}` + "\n"))
	}
}

// importOldData copies dir/orders.json and the logos in dir/uploads/artwork
// into the database. The files are only read, never changed.
func importOldData(db *pgstore.DB, dir string) {
	path := filepath.Join(dir, "orders.json")
	if _, err := os.Stat(path); err == nil {
		list, err := orders.ReadFile(path)
		if err != nil {
			log.Fatalf("import: %s: %v", path, err)
		}
		n, err := db.ImportOrders(list)
		if err != nil {
			log.Fatalf("import: orders: %v", err)
		}
		log.Printf("import: copied %d orders from %s into the database", n, path)
	}
	logos := filepath.Join(dir, "uploads", "artwork")
	n, err := db.ImportArtworkDir(logos)
	if err != nil {
		log.Fatalf("import: logos: %v", err)
	}
	if n > 0 {
		log.Printf("import: copied %d logos from %s into the database", n, logos)
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

// artworkDir is where uploaded logos are kept: ARTWORK_DIR if set, else
// uploads/artwork in the directory the backend runs from.
func artworkDir() string {
	if p := os.Getenv("ARTWORK_DIR"); p != "" {
		return p
	}
	return "uploads/artwork"
}
