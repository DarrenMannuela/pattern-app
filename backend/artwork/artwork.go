// Package artwork keeps the logos and pictures uploaded for embroidery and
// sablon. Each picture is stored once, as a file named by a hash of its
// contents, so a logo used across many revisions and orders takes the space
// of one file, and the orders only carry its short id.
package artwork

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg" // registers the decoder image.DecodeConfig needs
	_ "image/png"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// MaxBytes is the largest picture accepted. The app sends a logo already
// shrunk to at most 1600 px, which is well under this.
const MaxBytes = 8 << 20

// maxSide bounds a picture's width and height, so a crafted file can't claim
// a size that would exhaust memory wherever it is drawn.
const maxSide = 6000

// kinds are the picture formats kept, by sniffed content type.
var kinds = map[string]string{"image/png": ".png", "image/jpeg": ".jpg"}

// idPattern is what a stored picture's id looks like: 32 hex digits of the
// content hash and the format's extension. Anything else is never a path.
var idPattern = regexp.MustCompile(`^[0-9a-f]{32}\.(png|jpg)$`)

// ValidID reports whether id has the form Save gives ids.
func ValidID(id string) bool { return idPattern.MatchString(id) }

// Store is a directory of pictures.
type Store struct {
	dir string
}

// New opens the store in dir, creating the directory if needed.
func New(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &Store{dir: dir}, nil
}

// InvalidError is what Save returns for a picture it won't keep: not a PNG or
// JPEG, too large, or a size it can't be. Its message is fit to show.
type InvalidError struct{ msg string }

func (e *InvalidError) Error() string { return e.msg }

func invalid(format string, args ...any) error { return &InvalidError{fmt.Sprintf(format, args...)} }

// errNotPicture is the InvalidError for data that isn't a PNG or JPEG picture.
var errNotPicture = invalid("the file isn't a PNG or JPEG picture")

// Keeper keeps pictures: a folder of files (Store), or the database.
type Keeper interface {
	// Save stores data and returns its id; the same picture always gets the same id.
	Save(data []byte) (string, error)
	// Load returns the picture with id, or ErrNotFound.
	Load(id string) ([]byte, error)
}

// ErrNotFound is what Load returns for an id with no picture.
var ErrNotFound = errors.New("no such picture")

// ContentType is the media type of the picture with id.
func ContentType(id string) string {
	if strings.HasSuffix(id, ".jpg") {
		return "image/jpeg"
	}
	return "image/png"
}

// Identify checks that data is a picture worth keeping (a PNG or JPEG of a
// sane size) and returns the id it is kept under: a hash of its contents and
// its format's extension. A picture it refuses gets an *InvalidError.
func Identify(data []byte) (string, error) {
	if len(data) == 0 {
		return "", invalid("no picture sent")
	}
	if len(data) > MaxBytes {
		return "", invalid("the picture is too large (over %d MB)", MaxBytes>>20)
	}
	ext, ok := kinds[http.DetectContentType(data)]
	if !ok {
		return "", errNotPicture
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return "", errNotPicture
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width > maxSide || cfg.Height > maxSide {
		return "", invalid("the picture must be at most %d px on a side", maxSide)
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:16]) + ext, nil
}

// Save stores data and returns its id. Saving the same picture twice gives the
// same id and keeps one file.
func (s *Store) Save(data []byte) (string, error) {
	id, err := Identify(data)
	if err != nil {
		return "", err
	}
	path := filepath.Join(s.dir, id)
	if _, err := os.Stat(path); err == nil {
		return id, nil
	}
	// Written to a temporary file and renamed, so a reader never sees half a picture.
	tmp, err := os.CreateTemp(s.dir, "upload-*")
	if err != nil {
		return "", err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return "", err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmp.Name())
		return "", err
	}
	if err := os.Chmod(tmp.Name(), 0o644); err != nil {
		os.Remove(tmp.Name())
		return "", err
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		os.Remove(tmp.Name())
		return "", err
	}
	return id, nil
}

// Load returns the picture with id, or ErrNotFound.
func (s *Store) Load(id string) ([]byte, error) {
	path, ok := s.Path(id)
	if !ok {
		return nil, ErrNotFound
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNotFound
	}
	return data, err
}

// Path returns where the picture with id is kept, or false when id isn't one
// Save could have given. It doesn't check that the file exists.
func (s *Store) Path(id string) (string, bool) {
	if !ValidID(id) {
		return "", false
	}
	return filepath.Join(s.dir, id), true
}
