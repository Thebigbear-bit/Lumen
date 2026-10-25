// Tests for Lumen's own additions: night mode, the opened-app history, the city from the TV, updates.   Run: npm test
import {build} from 'esbuild';
const dir = new URL('../node_modules/', import.meta.url).pathname;
const stub = {name: 'stub', setup (b) {
	b.onResolve({filter: /^\.\/(apps|luna|weathernet|homehookcmd)$/}, (a) => ({path: a.path, namespace: 'stub'}));
	b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export const exec = () => Promise.resolve(""); export const lunaCall = () => Promise.reject(new Error("no")); export const fetchText = () => Promise.reject(new Error("no")); export const writeFileCommands = (p, t) => ["write " + p];', loader: 'js'}));
}};
const load = async (name) => {
	const out = dir + `.cache-lumen-${name}.mjs`;
	await build({entryPoints: [new URL(`../src/lib/${name}.ts`, import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error', plugins: [stub]});
	return import(out);
};
let fail = 0;
const eq = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
const store = {};
globalThis.localStorage = {getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }};

// ---- night mode ----
const n = await load('night');
const at = (h, m = 0) => h * 60 + m;
eq([n.isNight(at(18, 30), 'sun', at(7, 10), at(17, 0)), n.isNight(at(12), 'sun', at(7, 10), at(17, 0)), n.isNight(at(6), 'sun', at(7, 10), at(17, 0))], [true, false, true], 'sunset to sunrise: evening and early morning are night, midday is not');
eq([n.isNight(at(21, 59), 'late'), n.isNight(at(22), 'late'), n.isNight(at(6, 59), 'late'), n.isNight(at(7), 'late')], [false, true, true, false], '10 PM to 7 AM');
eq(n.isNight(at(23), 'sun', null, null), true, 'sun times unknown: 10 PM to 7 AM is used');
eq(n.isNight(at(23), 'off', at(7), at(17)), false, 'off is never night');

// ---- opened history ----
const h = await load('lastopened');
eq(h.pushHistory(['a', 'b', 'c'], 'b'), ['b', 'a', 'c'], 'opening an app again moves it to the front, no repeats');
eq(h.pushHistory(['1', '2', '3', '4', '5', '6', '7', '8'], '9').length, 8, 'the history keeps eight');
h.writeLastOpened('netflix'); h.writeLastOpened('youtube'); h.writeLastOpened('netflix');
eq([h.readLastOpened(), h.readOpenedHistory()], ['netflix', ['netflix', 'youtube']], 'last opened and the history are kept together');

// ---- city from the TV ----
const c = await load('tvcity');
eq(c.placeFrom({City: 'Copenhagen', Country: 'Denmark', ZoneID: 'Europe/Copenhagen'}), {city: 'Copenhagen', country: 'Denmark'}, 'the TV time zone gives the city and country');
eq(c.placeFrom({ZoneID: 'UTC'}), null, 'no city: nothing');
const results = [{name: 'Copenhagen', lat: 1, lon: 1, detail: 'New York, United States'}, {name: 'Copenhagen', lat: 55.7, lon: 12.6, detail: 'Capital Region, Denmark'}];
eq(c.pickCity(results, 'Denmark').lat, 55.7, 'the result in the TV\'s country wins');
eq(c.pickCity(results, 'Narnia').lat, 1, 'else the first result');
eq(c.pickCity([], 'Denmark'), null, 'no results: nothing');

// ---- updates ----
const u = await load('update');
eq([u.compareVersions('1.1.0', '1.0.9'), u.compareVersions('1.0.10', '1.0.9'), u.compareVersions('1.0', '1.0.0'), u.compareVersions('0.9', '1.0')], [1, 1, 0, -1], 'versions compare number by number');
const sha = 'a'.repeat(64);
const listing = (over) => JSON.stringify({packages: [{id: 'com.thebigbear.lumen', manifest: Object.assign({version: '9.0.0', ipkUrl: 'https://github.com/Thebigbear-bit/Lumen/releases/download/v9.0.0/com.thebigbear.lumen_9.0.0_all.ipk', ipkHash: {sha256: sha}}, over)}]});
eq(u.parseListing(listing({})), {version: '9.0.0', ipkUrl: 'https://github.com/Thebigbear-bit/Lumen/releases/download/v9.0.0/com.thebigbear.lumen_9.0.0_all.ipk', sha256: sha}, 'the listing gives the version, download and checksum');
eq(u.parseListing(listing({ipkUrl: 'https://evil.example/x.ipk'})), null, 'a download from anywhere else is refused');
eq(u.parseListing(listing({ipkUrl: "https://github.com/Thebigbear-bit/Lumen/releases/download/v9/x';reboot;'.ipk"})), null, 'an address that could break out of the script is refused');
eq(u.parseListing(listing({ipkHash: {sha256: 'nothex'}})), null, 'a missing or odd checksum is refused');
eq(u.parseListing(listing({version: '9.0.0; rm -rf /'})), null, 'an odd version is refused');
eq(u.parseListing('not json'), null, 'not a listing: nothing');
const script = u.updateScript(u.parseListing(listing({})));
eq([script.indexOf('sha256sum') > 0, script.indexOf('checksum mismatch') > 0, script.indexOf('applicationManager/launch') > 0], [true, true, true], 'the update script checks the checksum before installing, then opens Lumen again');
eq(u.pendingWhatsNew(), null, 'a fresh install has nothing to tell');
eq(u.pendingWhatsNew(), null, '... and stays quiet on later starts');
store['lumen-last-version'] = '0.9.0';
eq(u.pendingWhatsNew(), '0.9.0', 'after an update the old version is reported');
eq(u.pendingWhatsNew(), '0.9.0', 'still, until the message was really shown (a run closed at once does not use it up)');
u.markWhatsNewShown();
eq(u.pendingWhatsNew(), null, 'once shown, not again');
delete store['lumen-last-version']; store['customlauncher-config-v1'] = '{}';
eq(u.pendingWhatsNew(), 'older', 'an install from before this was kept counts as an update');
process.exit(fail ? 1 : 0);
