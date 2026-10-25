// The apps and inputs opened from Lumen (the home row or the Recent apps panel), newest first. Home puts the
// highlight back on the newest (Settings → Look → When Home is pressed) and the Continue strip shows the others.
// Kept in localStorage, so it survives a restart.

const LAST_OPENED_KEY = 'customlauncher-last-opened';
const HISTORY_KEY = 'lumen-opened-history';
import {exec} from './apps';

const KEEP = 8;
const OPENED_AT_KEY = 'lumen-last-opened-at';
const STANDBY_AT_KEY = 'lumen-standby-at';
const WAKEUPS_KEY = 'lumen-opened-wakeups';
/** With no standby seen (Lumen may not have been running when the TV was turned off), an app opened longer ago than
 *  this is not returned to either. */
const STALE_MS = 4 * 3600 * 1000;

function readTime (key: string): number {
	try { const n = Number(localStorage.getItem(key)); return isFinite(n) ? n : 0; } catch { return 0; }
}

/** How many times the TV has woken from standby (the kernel's wakeup count; it goes up each time the TV is switched
 *  on with Quick Start). Needs root; null when it can't be read. */
export function readWakeups (): Promise<string | null> {
	return exec("cat /sys/power/wakeup_count 2>/dev/null", 3000).then((out) => (/^\d+$/.test(out.trim()) ? out.trim() : null), () => null);
}

/** Was the TV switched off (and on) since the app was opened last? null when it can't be told. */
export function sleptSinceOpened (): Promise<boolean | null> {
	let saved: string | null = null;
	try { saved = localStorage.getItem(WAKEUPS_KEY); } catch { /* unknown */ }
	if (!saved) return Promise.resolve(null);
	return readWakeups().then((now) => (now === null ? null : now !== saved));
}

/** The TV went into standby (turned off) now. */
export function noteStandby (now = Date.now()): void {
	try { localStorage.setItem(STANDBY_AT_KEY, String(now)); } catch { /* only this convenience is lost */ }
}

/** The app to put the highlight back on when Home is pressed: the one opened last, unless the TV was turned off
 *  since (then Lumen starts at the first tile, as after switching the TV on) or it was opened long ago. */
export function returnKey (now = Date.now()): string | null {
	const key = readLastOpened();
	const openedAt = readTime(OPENED_AT_KEY);
	if (!key || !openedAt) return null;
	if (readTime(STANDBY_AT_KEY) >= openedAt) return null;
	return now - openedAt > STALE_MS ? null : key;
}

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
		localStorage.setItem(OPENED_AT_KEY, String(Date.now()));
		localStorage.removeItem(WAKEUPS_KEY);
		readWakeups().then((n) => { if (n !== null) { try { localStorage.setItem(WAKEUPS_KEY, n); } catch { /* unknown next time */ } } });
		localStorage.setItem(HISTORY_KEY, JSON.stringify(pushHistory(readOpenedHistory(), key)));
	} catch { /* storage full or blocked: only this convenience is lost */ }
}

export function pushHistory (list: string[], key: string): string[] {
	return [key].concat(list.filter((k) => k !== key)).slice(0, KEEP);
}
