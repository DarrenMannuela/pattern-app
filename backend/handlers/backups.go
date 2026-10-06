package handlers

import (
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// backupStatus is what GET /api/backups answers.
type backupStatus struct {
	Configured    bool        `json:"configured"`
	Count         int         `json:"count"`
	Latest        *backupFile `json:"latest,omitempty"`
	WarnAfterDays int         `json:"warnAfterDays"`
	Problem       string      `json:"problem,omitempty"`
}

type backupFile struct {
	Name    string    `json:"name"`
	TakenAt time.Time `json:"takenAt"`
	Bytes   int64     `json:"bytes"`
}

// BackupStatus handles GET /api/backups: how many backups there are and when
// the newest was taken, read from the backup folder (shared read-only with
// the backup service), so the app can say when backups have stopped. dir ""
// means backups aren't set up (running without Docker). warnDays is how old
// the newest may get before that is worth a warning (default 8: weekly, plus
// a day's grace).
func BackupStatus(dir, warnDays string) http.HandlerFunc {
	warn, err := strconv.Atoi(warnDays)
	if err != nil || warn <= 0 {
		warn = 8
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		st := backupStatus{Configured: dir != "", WarnAfterDays: warn}
		if dir == "" {
			writeJSON(w, http.StatusOK, st)
			return
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			st.Problem = "The backup folder can't be read."
			writeJSON(w, http.StatusOK, st)
			return
		}
		for _, e := range entries {
			name := e.Name()
			if e.IsDir() || !strings.HasPrefix(name, "konveksi_") || !strings.HasSuffix(name, ".dump") {
				continue // .partial files are backups still being written
			}
			info, err := e.Info()
			if err != nil {
				continue
			}
			st.Count++
			if st.Latest == nil || info.ModTime().After(st.Latest.TakenAt) {
				st.Latest = &backupFile{Name: name, TakenAt: info.ModTime(), Bytes: info.Size()}
			}
		}
		writeJSON(w, http.StatusOK, st)
	}
}
