package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func readStatus(t *testing.T, h http.HandlerFunc) backupStatus {
	t.Helper()
	w := httptest.NewRecorder()
	h(w, httptest.NewRequest(http.MethodGet, "/api/backups", nil))
	var st backupStatus
	if err := json.NewDecoder(w.Body).Decode(&st); err != nil {
		t.Fatal(err)
	}
	return st
}

func TestBackupStatusFindsTheNewest(t *testing.T) {
	dir := t.TempDir()
	old := time.Now().Add(-9 * 24 * time.Hour)
	for name, when := range map[string]time.Time{
		"konveksi_2026-09-26_0200.dump":                old,
		"konveksi_2026-10-04_0200.dump":                time.Now().Add(-time.Hour),
		"konveksi_2026-10-05_0200.dump.partial":        time.Now(), // still being written
		"notes.txt":                                    time.Now(),
		"konveksi_2026-10-01_0900_before-restore.dump": old.Add(24 * time.Hour),
	} {
		p := filepath.Join(dir, name)
		os.WriteFile(p, []byte("x"), 0o644)
		os.Chtimes(p, when, when)
	}
	st := readStatus(t, BackupStatus(dir, ""))
	if !st.Configured || st.Count != 3 || st.Latest == nil || st.Latest.Name != "konveksi_2026-10-04_0200.dump" || st.WarnAfterDays != 8 {
		t.Fatalf("status: %+v %+v", st, st.Latest)
	}
}

func TestBackupStatusWithoutBackups(t *testing.T) {
	if st := readStatus(t, BackupStatus("", "")); st.Configured {
		t.Errorf("no folder should mean not configured: %+v", st)
	}
	if st := readStatus(t, BackupStatus(t.TempDir(), "3")); !st.Configured || st.Count != 0 || st.Latest != nil || st.WarnAfterDays != 3 {
		t.Errorf("empty folder: %+v", st)
	}
	if st := readStatus(t, BackupStatus(filepath.Join(t.TempDir(), "missing"), "")); st.Problem == "" {
		t.Errorf("a missing folder should be reported: %+v", st)
	}
}
