// The apps and inputs opened from Lumen (the home row or the Recent apps panel), newest first. Home puts the
// highlight back on the newest (Settings → Look → When Home is pressed) and the Continue strip shows the others.
// Kept in localStorage, so it survives a restart.

const LAST_OPENED_KEY = 'customlauncher-last-opened';
const HISTORY_KEY = 'lumen-opened-history';
const KEEP = 8;

export function readLastOpened (): string | null {
	try { return localStorage.getItem(LAST_OPENED_KEY); } catch { return null; }
}

/** Newest first, without repeats. */
export function readOpenedHistory (): string[] {
	try {
		const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
		return Array.isArray(list) ? list.filter((k) => typeof k === 'string').slice(0, KEEP) : [];
	} catch { return []; }
}

export function writeLastOpened (key: string): void {
	try {
		localStorage.setItem(LAST_OPENED_KEY, key);
		localStorage.setItem(HISTORY_KEY, JSON.stringify(pushHistory(readOpenedHistory(), key)));
	} catch { /* storage full or blocked: only this convenience is lost */ }
}

export function pushHistory (list: string[], key: string): string[] {
	return [key].concat(list.filter((k) => k !== key)).slice(0, KEEP);
}
