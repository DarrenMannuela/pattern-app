package pgstore

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"github.com/jackc/pgx/v5"

	"patternapp/backend/artwork"
	"patternapp/backend/orders"
)

// Orders keeps orders in the orders table; it is an orders.Backend.
func (db *DB) Orders() orders.Backend { return ordersTable{db} }

type ordersTable struct{ db *DB }

func orderID(id string) (int64, error) {
	n, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("order id %q isn't a number", id)
	}
	return n, nil
}

// Load returns every order, oldest first.
func (t ordersTable) Load() ([]*orders.Order, error) {
	ctx, cancel := op()
	defer cancel()
	rows, err := t.db.pool.Query(ctx, `SELECT data FROM orders ORDER BY created_at, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []*orders.Order
	for rows.Next() {
		var doc []byte
		if err := rows.Scan(&doc); err != nil {
			return nil, err
		}
		o := new(orders.Order)
		if err := json.Unmarshal(doc, o); err != nil {
			return nil, fmt.Errorf("a stored order isn't valid: %w", err)
		}
		list = append(list, o)
	}
	return list, rows.Err()
}

// bumpOrders raises the orders counter to the order being written ($1).
const bumpOrders = `
WITH bump AS (
	INSERT INTO counters (name, value) VALUES ('orders', $1)
	ON CONFLICT (name) DO UPDATE SET value = greatest(counters.value, EXCLUDED.value)
)`

const upsertOrder = bumpOrders + `
INSERT INTO orders (id, customer_name, garment_type, status, data, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (id) DO UPDATE SET
	customer_name = EXCLUDED.customer_name,
	garment_type  = EXCLUDED.garment_type,
	status        = EXCLUDED.status,
	data          = EXCLUDED.data,
	updated_at    = EXCLUDED.updated_at`

func orderArgs(o *orders.Order) ([]any, error) {
	id, err := orderID(o.ID)
	if err != nil {
		return nil, err
	}
	doc, err := json.Marshal(o)
	if err != nil {
		return nil, err
	}
	return []any{id, o.CustomerName, o.GarmentType, o.Status, doc, o.CreatedAt, o.UpdatedAt}, nil
}

// HighestOrderID is the highest number ever given to an order, deleted or
// not: 0 for a database that has never held one.
func (db *DB) HighestOrderID() (int, error) { return ordersTable{db}.HighestID() }

// HighestID is the highest number ever given to an order, deleted or not.
func (t ordersTable) HighestID() (int, error) {
	ctx, cancel := op()
	defer cancel()
	var n int64
	err := t.db.pool.QueryRow(ctx, `SELECT value FROM counters WHERE name = 'orders'`).Scan(&n)
	if isNoRows(err) {
		return 0, nil
	}
	return int(n), err
}

// Put writes one order, new or changed.
func (t ordersTable) Put(o *orders.Order, _ []*orders.Order) error {
	args, err := orderArgs(o)
	if err != nil {
		return err
	}
	ctx, cancel := op()
	defer cancel()
	_, err = t.db.pool.Exec(ctx, upsertOrder, args...)
	return err
}

// Delete removes one order.
func (t ordersTable) Delete(id string, _ []*orders.Order) error {
	n, err := orderID(id)
	if err != nil {
		return err
	}
	ctx, cancel := op()
	defer cancel()
	_, err = t.db.pool.Exec(ctx, `DELETE FROM orders WHERE id = $1`, n)
	return err
}

// ImportOrders copies orders into the database in one transaction, keeping
// their ids; an order already there is left as it is. It returns how many
// were added.
func (db *DB) ImportOrders(list []*orders.Order) (int, error) {
	ctx, cancel := op()
	defer cancel()
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	added := 0
	for _, o := range list {
		if o == nil {
			continue
		}
		args, err := orderArgs(o)
		if err != nil {
			return 0, err
		}
		tag, err := tx.Exec(ctx, bumpOrders+`
INSERT INTO orders (id, customer_name, garment_type, status, data, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`, args...)
		if err != nil {
			return 0, err
		}
		added += int(tag.RowsAffected())
	}
	return added, tx.Commit(ctx)
}

// Artwork keeps logos in the artwork table; it is an artwork.Keeper.
func (db *DB) Artwork() artwork.Keeper { return artworkTable{db} }

type artworkTable struct{ db *DB }

// Save stores a picture under its content id; saving it again changes nothing.
func (t artworkTable) Save(data []byte) (string, error) {
	id, err := artwork.Identify(data)
	if err != nil {
		return "", err
	}
	ctx, cancel := op()
	defer cancel()
	_, err = t.db.pool.Exec(ctx, `INSERT INTO artwork (id, content_type, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`, id, artwork.ContentType(id), data)
	return id, err
}

// Load returns the picture with id, or artwork.ErrNotFound.
func (t artworkTable) Load(id string) ([]byte, error) {
	if !artwork.ValidID(id) {
		return nil, artwork.ErrNotFound
	}
	ctx, cancel := op()
	defer cancel()
	var data []byte
	err := t.db.pool.QueryRow(ctx, `SELECT data FROM artwork WHERE id = $1`, id).Scan(&data)
	if isNoRows(err) {
		return nil, artwork.ErrNotFound
	}
	return data, err
}

// ImportArtworkDir copies the logo files in dir (a folder kept by
// artwork.Store) into the database. A missing folder is nothing to import.
func (db *DB) ImportArtworkDir(dir string) (int, error) {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	keeper := db.Artwork()
	added := 0
	for _, e := range entries {
		if e.IsDir() || !artwork.ValidID(e.Name()) {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return added, err
		}
		if _, err := keeper.Save(data); err != nil {
			return added, fmt.Errorf("%s: %w", e.Name(), err)
		}
		added++
	}
	return added, nil
}

// LoadPieceDocs, PutPieceDoc and DeletePieceDoc keep the Cutting Layout
// pieces (handlers.PieceDocs).
func (db *DB) LoadPieceDocs() ([][]byte, error) {
	ctx, cancel := op()
	defer cancel()
	rows, err := db.pool.Query(ctx, `SELECT data FROM layout_pieces ORDER BY id`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[[]byte])
}

func (db *DB) PutPieceDoc(id string, doc []byte) error {
	n, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		return fmt.Errorf("piece id %q isn't a number", id)
	}
	ctx, cancel := op()
	defer cancel()
	_, err = db.pool.Exec(ctx, `INSERT INTO layout_pieces (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, n, doc)
	return err
}

func (db *DB) DeletePieceDoc(id string) error {
	n, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		return fmt.Errorf("piece id %q isn't a number", id)
	}
	ctx, cancel := op()
	defer cancel()
	_, err = db.pool.Exec(ctx, `DELETE FROM layout_pieces WHERE id = $1`, n)
	return err
}
