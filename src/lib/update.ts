// Updates (Settings → Options → Lumen updates): when Settings opens, at most every 12 hours, Lumen reads its own
// Homebrew Channel listing on GitHub (repo/apps.json: version, download address and SHA-256 of the .ipk). On a
// rooted TV, OK downloads the new .ipk, checks its SHA-256, installs it and opens Lumen again; without root it opens
// the Homebrew Channel, where the update is offered too. After an update, a short "what's new" toast is shown once.

import {APP_ID, STORAGE_KEY} from '../config/constants';
import {HEARTH_VERSION} from '../config/version';
import {exec} from './apps';
import {writeFileCommands} from './homehookcmd';
import {lunaCall} from './luna';
import {fetchText} from './weathernet';

export const LISTING_URL = 'https://raw.githubusercontent.com/Thebigbear-bit/Lumen/main/repo/apps.json';
const CHECK_KEY = 'lumen-update-check';
const SEEN_KEY = 'lumen-last-version';
const CHECK_EVERY_MS = 12 * 3600 * 1000;

/** Shown once after an update to this version. */
export const WHATS_NEW = 'The LG Content Store is back on the app row, so you can install apps again.';

export interface Release {version: string; ipkUrl: string; sha256: string}

export type UpdateState =
	| {kind: 'checking'}
	| {kind: 'current'}
	| {kind: 'available'; release: Release}
	| {kind: 'installing'; release: Release}
	| {kind: 'failed'};

/** -1, 0 or 1, comparing "1.2.10" and "1.2.9" number by number. */
export function compareVersions (a: string, b: string): number {
	const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
	const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const x = pa[i] || 0, y = pb[i] || 0;
		if (x !== y) return x > y ? 1 : -1;
	}
	return 0;
}

/** The release in the Homebrew listing, or null when the text is not a usable listing. */
export function parseListing (text: string): Release | null {
	try {
		const data = JSON.parse(text);
		const pkg = data && Array.isArray(data.packages) ? data.packages.filter((p: {id?: string}) => p && p.id === APP_ID)[0] : null;
		const m = pkg && pkg.manifest;
		return m ? validRelease({version: m.version, ipkUrl: m.ipkUrl, sha256: m.ipkHash && m.ipkHash.sha256}) : null;
	} catch {
		return null;
	}
}

/** Only a plain version, a download from this project's own GitHub releases and a SHA-256 are accepted. */
function validRelease (r: {version?: unknown; ipkUrl?: unknown; sha256?: unknown} | null | undefined): Release | null {
	if (!r || typeof r.version !== 'string' || !/^\d+(\.\d+){1,3}$/.test(r.version)) return null;
	if (typeof r.ipkUrl !== 'string' || !/^https:\/\/github\.com\/Thebigbear-bit\/Lumen\/releases\/download\/[\w.\-/]+\.ipk$/.test(r.ipkUrl)) return null;
	if (typeof r.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(r.sha256)) return null;
	return {version: r.version, ipkUrl: r.ipkUrl, sha256: r.sha256};
}

function stateFor (release: Release | null): UpdateState {
	if (!release) return {kind: 'failed'};
	return compareVersions(release.version, HEARTH_VERSION) > 0 ? {kind: 'available', release} : {kind: 'current'};
}

/** What the last check found, when it is recent enough to reuse. */
function savedCheck (now: number): UpdateState | null {
	try {
		const saved = JSON.parse(localStorage.getItem(CHECK_KEY) || 'null');
		if (!saved || typeof saved.at !== 'number' || now - saved.at > CHECK_EVERY_MS || saved.at > now) return null;
		return stateFor(validRelease(saved.release));
	} catch {
		return null;
	}
}

/** Checks for a newer Lumen (reuses a check from the last 12 hours unless `force`). */
export function checkForUpdate (allowShell: boolean, force = false): Promise<UpdateState> {
	const now = Date.now();
	const saved = force ? null : savedCheck(now);
	if (saved && saved.kind !== 'failed') return Promise.resolve(saved);
	return fetchText(LISTING_URL + '?t=' + Math.floor(now / 60000), allowShell).then((text) => {
		const release = parseListing(text);
		if (release) { try { localStorage.setItem(CHECK_KEY, JSON.stringify({at: now, release})); } catch { /* only the reuse is lost */ } }
		return stateFor(release);
	}, (): UpdateState => ({kind: 'failed'}));
}

/** The script that downloads, checks and installs the update, then opens Lumen again. It runs on its own (the
 *  installer closes Lumen while it works). */
export function updateScript (release: Release): string {
	const dir = `/media/developer/apps/usr/palm/applications/${APP_ID}`;
	return [
		'#!/bin/sh',
		'F=/tmp/lumen-update.ipk',
		`URL='${release.ipkUrl}'`,
		`SUM='${release.sha256}'`,
		'rm -f "$F"',
		'curl -fsSL -o "$F" "$URL" 2>/dev/null || wget -q -O "$F" "$URL" || { echo "download failed"; exit 1; }',
		'[ "$(sha256sum "$F" | cut -d" " -f1)" = "$SUM" ] || { echo "checksum mismatch"; rm -f "$F"; exit 1; }',
		// the installer keeps its reply open: watch its output for the end, then stop it (a pipe would wait for the timeout)
		'O=/tmp/lumen-install.out',
		`luna-send -w 120000 -i luna://com.webos.appInstallService/dev/install '{"id":"com.ares.defaultName","ipkUrl":"/tmp/lumen-update.ipk","subscribe":true}' >"$O" 2>&1 &`,
		'P=$!',
		'i=0; while [ $i -lt 120 ]; do grep -qE \'"state":"installed"|"errorText"\' "$O" && break; sleep 1; i=$((i+1)); done',
		'kill $P 2>/dev/null',
		'grep -oE \'"state":"installed"|"errorText":"[^"]*"\' "$O" | head -1',
		'rm -f "$F" "$O"',
		`grep -q '"version": *"${release.version}"' '${dir}/appinfo.json' && echo "installed ${release.version}"`,
		'sleep 2',
		`luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"${APP_ID}"}' >/dev/null`
	].join('\n') + '\n';
}

/** Starts the update on a rooted TV (resolves once it is running on its own; Lumen closes and reopens). */
export function installUpdate (release: Release): Promise<void> {
	const path = '/tmp/lumen-update.sh';
	const write = writeFileCommands(path, updateScript(release)).join(' && ');
	return exec(`${write} && chmod 755 '${path}' && (setsid sh '${path}' </dev/null >/tmp/lumen-update.log 2>&1 &) && echo LUMEN_UPDATE_STARTED`, 8000)
		.then((out) => { if (out.indexOf('LUMEN_UPDATE_STARTED') === -1) throw new Error('the TV did not start the update'); });
}

/** Opens the Homebrew Channel (where the update is offered too), for TVs without root. */
export function openHomebrew (): Promise<unknown> {
	return lunaCall('luna://com.webos.applicationManager/launch', {id: 'org.webosbrew.hbchannel'}, 4000);
}

/** The version whose "what's new" was shown last, when this version differs (an update), else null. A config from
 *  before this was kept counts as an update from an older version; a fresh install has nothing to tell (it is marked
 *  at once). Nothing else is written: `markWhatsNewShown` is called once the message is really on screen, so a run
 *  that is closed straight away (the installer and the takeover can open Lumen for a moment) does not use it up. */
export function pendingWhatsNew (): string | null {
	try {
		const seen = localStorage.getItem(SEEN_KEY);
		if (seen === null && localStorage.getItem(STORAGE_KEY) === null) { markWhatsNewShown(); return null; }
		if (seen === HEARTH_VERSION) return null;
		return seen === null ? 'older' : seen;
	} catch {
		return null;
	}
}

export function markWhatsNewShown (): void {
	try { localStorage.setItem(SEEN_KEY, HEARTH_VERSION); } catch { /* shown again next time: harmless */ }
}

export function updateText (s: UpdateState | null | undefined): string {
	if (!s || s.kind === 'checking') return 'Checking…';
	if (s.kind === 'current') return `Up to date (${HEARTH_VERSION})`;
	if (s.kind === 'available') return `${s.release.version} available: OK updates`;
	if (s.kind === 'installing') return `Installing ${s.release.version}…`;
	return "Couldn't check: OK tries again";
}
