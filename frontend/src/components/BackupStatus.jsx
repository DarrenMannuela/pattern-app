import { useEffect, useState } from "react";
import { api } from "../api.js";

const DAY = 24 * 60 * 60 * 1000;

function ago(when, now) {
  const days = Math.floor((now - new Date(when).getTime()) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

// When the data was last backed up, under the orders list: quiet while the
// weekly backups run, a warning when they have stopped or never started.
// Shows nothing where backups aren't set up (running without Docker).
export default function BackupStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    api
      .backupStatus()
      .then((st) => setStatus({ ...st, checkedAt: Date.now() }))
      .catch(() => setStatus(null));
  }, []);
  if (!status?.configured) return null;

  const latest = status.latest;
  const now = status.checkedAt;
  const stale = latest && now - new Date(latest.takenAt).getTime() > status.warnAfterDays * DAY;
  let text;
  if (status.problem) text = `${status.problem} Check the backup service.`;
  else if (!latest) text = "No backup has been taken yet. Check the backup service.";
  else if (stale) text = `The last backup was ${ago(latest.takenAt, now)}. Backups seem to have stopped: check the backup service.`;
  else text = `Backed up ${ago(latest.takenAt, now)} · ${status.count} kept`;
  const bad = Boolean(status.problem || !latest || stale);
  return (
    <p className={`backup-status${bad ? " is-bad" : ""}`} role={bad ? "alert" : "status"} title={latest ? `${latest.name}, ${Math.round(latest.bytes / 1024)} KB` : undefined}>
      {text}
    </p>
  );
}
