// The app or input opened last from Lumen (the home row or the Recent apps panel), so Home can put the highlight
// back on it (Settings → Look → When Home is pressed). Kept in localStorage, so it survives a restart.

const LAST_OPENED_KEY = 'customlauncher-last-opened';

export function readLastOpened (): string | null {
	try { return localStorage.getItem(LAST_OPENED_KEY); } catch { return null; }
}

export function writeLastOpened (key: string): void {
	try { localStorage.setItem(LAST_OPENED_KEY, key); } catch { /* storage full or blocked: only this convenience is lost */ }
}
