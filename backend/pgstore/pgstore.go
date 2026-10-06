// Package pgstore keeps the backend's data in PostgreSQL: the orders, the
// uploaded logos and the Cutting Layout pieces. It is used when DATABASE_URL
// is set (the Docker setup); without it the backend keeps its JSON file.
//
// Each order is one row: its whole document as JSONB (the shape the app
// already uses, so the Go types stay the one schema), with the customer,
// garment, status and dates beside it as columns, so the table can be read
// and searched by hand. Logos are rows of bytes keyed by their content hash.
package pgstore

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DB is an open connection pool with the schema in place.
type DB struct {
	pool *pgxpool.Pool
}

// opTimeout bounds one read or write, so a stuck database fails a request
// instead of hanging it.
const opTimeout = 15 * time.Second

func op() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), opTimeout)
}

// Open connects to the database at url and brings its schema up to date. The
// database may still be starting (Docker starts them together), so it keeps
// trying for up to wait before giving up.
func Open(ctx context.Context, url string, wait time.Duration) (*DB, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("DATABASE_URL isn't a valid PostgreSQL address: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	deadline := time.Now().Add(wait)
	for {
		pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err = pool.Ping(pingCtx)
		cancel()
		if err == nil {
			break
		}
		if time.Now().After(deadline) || ctx.Err() != nil {
			pool.Close()
			return nil, fmt.Errorf("can't reach the database: %w", err)
		}
		log.Printf("pgstore: waiting for the database: %v", err)
		time.Sleep(2 * time.Second)
	}
	db := &DB{pool: pool}
	if err := db.migrate(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("set up the database: %w", err)
	}
	return db, nil
}

// Close releases the connections.
func (db *DB) Close() { db.pool.Close() }

// Ping reports whether the database answers.
func (db *DB) Ping(ctx context.Context) error { return db.pool.Ping(ctx) }

// migrations are applied in order, each once; the number of the last one
// applied is kept in schema_migrations. Never edit one that has shipped: add
// the next instead.
var migrations = []string{
	// 1: orders, logos, layout pieces (with the starter pieces the in-memory
	// store has always opened with).
	`
CREATE TABLE orders (
	id            bigint PRIMARY KEY,
	customer_name text NOT NULL DEFAULT '',
	garment_type  text NOT NULL DEFAULT '',
	status        text NOT NULL DEFAULT '',
	data          jsonb NOT NULL,
	created_at    timestamptz NOT NULL,
	updated_at    timestamptz NOT NULL
);
CREATE INDEX orders_updated_at ON orders (updated_at DESC);

-- The highest number ever given to an order, so a deleted order's number is
-- never given to a new one (it may be on a printed pattern sheet).
CREATE TABLE counters (
	name  text PRIMARY KEY,
	value bigint NOT NULL
);

CREATE TABLE artwork (
	id           text PRIMARY KEY,
	content_type text NOT NULL,
	data         bytea NOT NULL,
	created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE layout_pieces (
	id         bigint PRIMARY KEY,
	data       jsonb NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO layout_pieces (id, data) VALUES
	(1, '{"id":"1","name":"Bodice front","width":34,"height":42,"qty":2,"color":"#3B7A82","grainLocked":true}'),
	(2, '{"id":"2","name":"Bodice back","width":32,"height":42,"qty":2,"color":"#B5453D","grainLocked":true}'),
	(3, '{"id":"3","name":"Sleeve","width":28,"height":34,"qty":2,"color":"#C79A3E","grainLocked":false}');
`,
}

func (db *DB) migrate(ctx context.Context) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) // a no-op after Commit
	// One backend at a time sets the schema up.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(827364)`); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	var applied int
	if err := tx.QueryRow(ctx, `SELECT coalesce(max(version), 0) FROM schema_migrations`).Scan(&applied); err != nil {
		return err
	}
	for v := applied + 1; v <= len(migrations); v++ {
		if _, err := tx.Exec(ctx, migrations[v-1]); err != nil {
			return fmt.Errorf("migration %d: %w", v, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, v); err != nil {
			return err
		}
		log.Printf("pgstore: applied database migration %d", v)
	}
	return tx.Commit(ctx)
}

// isNoRows reports a query that found nothing.
func isNoRows(err error) bool { return errors.Is(err, pgx.ErrNoRows) }
