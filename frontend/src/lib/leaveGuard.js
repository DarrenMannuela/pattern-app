// Knows whether leaving the screen now would lose work that isn't saved, so
// every way out (the top tabs, "All orders", the browser's back button) can
// ask first. The order page sets the warning while it has unsaved changes.

let warning = null;

export function setLeaveWarning(message) {
  warning = message || null;
}

// True when it is fine to leave: nothing unsaved, or the person said so.
export function confirmLeave() {
  return !warning || window.confirm(warning);
}
