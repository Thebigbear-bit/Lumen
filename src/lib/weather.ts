// The weather line under the clock's date: data from Open-Meteo (free, no key). This file is the pure part
// (reading the reply, describing it, formatting, the saved copy); weathernet.ts does the fetching.

export type TempUnit = 'c' | 'f';
export type WeatherIcon = 'sun' | 'moon' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';

export interface City {
	name: string;
	lat: number;
	lon: number;
	/** region and country, for telling cities of the same name apart */
	detail?: string;
}

export interface WeatherData {
	/** the place it is for */
	lat: number;
	lon: number;
	/** °C, as the service gives it (converted for display) */
	tempC: number;
	highC: number | null;
	lowC: number | null;
	/** WMO weather code */
	code: number;
	isDay: boolean;
	/** when it was read (ms since 1970) */
	at: number;
	/** the next few hours (absent in readings saved by older versions) */
	hours?: HourData[];
	/** today's sunrise and sunset, minutes after midnight in the place's own time (for night mode; absent when unknown) */
	sunrise?: number | null;
	sunset?: number | null;
}

export interface HourData {
	/** the hour of day, 0-23, in the place's own time */
	hour: number;
	tempC: number;
	code: number;
	isDay: boolean;
}

export const WEATHER_CACHE_KEY = 'customlauncher-weather-v1';
/** A reading younger than this is not fetched again. */
export const FRESH_MS = 30 * 60 * 1000;
/** An older reading than this is no longer shown (the TV was off for a long while). */
export const SHOWN_MS = 6 * 60 * 60 * 1000;

const num = (x: unknown): number | null => (typeof x === 'number' && isFinite(x) ? x : null);

/** Coordinates as they go into a web address: plain numbers only, nothing else can get in. */
function coord (n: number): string {
	return (Math.round(n * 1000) / 1000).toFixed(3);
}

export function validCoords (lat: unknown, lon: unknown): boolean {
	return typeof lat === 'number' && typeof lon === 'number' && isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function forecastUrl (lat: number, lon: number): string {
	return 'https://api.open-meteo.com/v1/forecast?latitude=' + coord(lat) + '&longitude=' + coord(lon)
		+ '&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code,is_day&forecast_hours=6'
		+ '&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&forecast_days=1&timezone=auto';
}

export function geocodeUrl (query: string): string {
	return 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(query.trim().slice(0, 60)) + '&count=8&language=en&format=json';
}

/** Reads Open-Meteo's forecast reply; null when it isn't one. */
export function parseWeather (json: string, lat: number, lon: number, now: number): WeatherData | null {
	try {
		const data = JSON.parse(json);
		const current = data && data.current;
		const temp = current ? num(current.temperature_2m) : null;
		const code = current ? num(current.weather_code) : null;
		if (temp === null || code === null) return null;
		const daily = data.daily || {};
		const first = (list: unknown): number | null => (Array.isArray(list) ? num(list[0]) : null);
		return {lat, lon, tempC: temp, highC: first(daily.temperature_2m_max), lowC: first(daily.temperature_2m_min), code, isDay: current.is_day !== 0, at: now, hours: parseHours(data.hourly, typeof current.time === 'string' ? current.time : ''),
			sunrise: minutesOf(Array.isArray(daily.sunrise) ? daily.sunrise[0] : null), sunset: minutesOf(Array.isArray(daily.sunset) ? daily.sunset[0] : null)};
	} catch {
		return null;
	}
}

/** "2026-10-26T06:45" as minutes after midnight (405); null when it is not such a time. */
export function minutesOf (time: unknown): number | null {
	const m = typeof time === 'string' ? /T(\d{2}):(\d{2})/.exec(time) : null;
	return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** The next three hours after `currentTime` (Open-Meteo's "2026-10-26T02:15", the place's own time; the hourly list
 *  can start an hour or so before it). Bad entries are skipped. */
export function parseHours (hourly: unknown, currentTime = ''): HourData[] {
	const h = (hourly && typeof hourly === 'object' ? hourly : {}) as Record<string, unknown>;
	const times = Array.isArray(h.time) ? h.time : [];
	const temps = Array.isArray(h.temperature_2m) ? h.temperature_2m : [];
	const codes = Array.isArray(h.weather_code) ? h.weather_code : [];
	const days = Array.isArray(h.is_day) ? h.is_day : [];
	const out: HourData[] = [];
	for (let i = 0; i < times.length && out.length < 3; i++) {
		if (typeof times[i] !== 'string' || (currentTime ? (times[i] as string) <= currentTime : i === 0)) continue;
		const match = /T(\d{2}):/.exec(times[i] as string);
		const tempC = num(temps[i]), code = num(codes[i]);
		if (!match || tempC === null || code === null) continue;
		out.push({hour: Number(match[1]), tempC, code, isDay: days[i] !== 0});
	}
	return out;
}

/** "15:00" or "3 PM" */
export function hourLabel (hour: number, format: '12h' | '24h'): string {
	if (format === '24h') return (hour < 10 ? '0' : '') + hour + ':00';
	return (hour % 12 || 12) + (hour < 12 ? ' AM' : ' PM');
}

/** Reads Open-Meteo's place-search reply into a list of cities. */
export function parseCities (json: string): City[] {
	try {
		const data = JSON.parse(json);
		const list = data && Array.isArray(data.results) ? data.results : [];
		const out: City[] = [];
		list.forEach((r: Record<string, unknown>) => {
			if (typeof r.name !== 'string' || !validCoords(r.latitude, r.longitude)) return;
			const detail = [r.admin1, r.country].filter((x) => typeof x === 'string' && x).join(', ');
			out.push({name: r.name, lat: r.latitude as number, lon: r.longitude as number, detail: detail || undefined});
		});
		return out;
	} catch {
		return [];
	}
}

/** Words and a picture for a WMO weather code. */
export function describe (code: number, isDay: boolean): {text: string; icon: WeatherIcon} {
	if (code === 0) return {text: 'Clear', icon: isDay ? 'sun' : 'moon'};
	if (code === 1) return {text: 'Mostly clear', icon: isDay ? 'sun' : 'moon'};
	if (code === 2) return {text: 'Partly cloudy', icon: 'partly'};
	if (code === 3) return {text: 'Overcast', icon: 'cloud'};
	if (code === 45 || code === 48) return {text: 'Fog', icon: 'fog'};
	if (code >= 51 && code <= 55) return {text: 'Drizzle', icon: 'rain'};
	if (code === 56 || code === 57) return {text: 'Freezing drizzle', icon: 'rain'};
	if (code === 61) return {text: 'Light rain', icon: 'rain'};
	if (code === 63) return {text: 'Rain', icon: 'rain'};
	if (code === 65) return {text: 'Heavy rain', icon: 'rain'};
	if (code === 66 || code === 67) return {text: 'Freezing rain', icon: 'rain'};
	if (code === 71) return {text: 'Light snow', icon: 'snow'};
	if (code === 73) return {text: 'Snow', icon: 'snow'};
	if (code === 75) return {text: 'Heavy snow', icon: 'snow'};
	if (code === 77) return {text: 'Snow grains', icon: 'snow'};
	if (code === 80) return {text: 'Light showers', icon: 'rain'};
	if (code === 81) return {text: 'Showers', icon: 'rain'};
	if (code === 82) return {text: 'Heavy showers', icon: 'rain'};
	if (code === 85 || code === 86) return {text: 'Snow showers', icon: 'snow'};
	if (code === 95) return {text: 'Thunderstorm', icon: 'storm'};
	if (code === 96 || code === 99) return {text: 'Thunderstorm, hail', icon: 'storm'};
	return {text: 'Cloudy', icon: 'cloud'};
}

/** "29°" (always whole degrees, in the chosen unit). */
export function formatTemp (celsius: number, unit: TempUnit): string {
	const value = unit === 'f' ? celsius * 9 / 5 + 32 : celsius;
	const rounded = Math.round(value);
	return (rounded === 0 ? 0 : rounded) + '°';        // no "-0°"
}

export interface WeatherView {
	icon: WeatherIcon;
	/** "29° Partly cloudy" */
	main: string;
	/** "29°" and "Partly cloudy" on their own (the Glass theme's weather card shows them apart) */
	temp: string;
	text: string;
	/** "H 31° L 25°", or empty */
	range: string;
	city: string;
	/** the next hours, for the Glass weather card (empty when off or unknown) */
	hours: {hour: number; temp: string; icon: WeatherIcon}[];
}

/** What the clock shows. */
export function weatherView (data: WeatherData, unit: TempUnit, showRange: boolean, cityName: string, showHours = false, now = Date.now()): WeatherView {
	const d = describe(data.code, data.isDay);
	const range = showRange && data.highC !== null && data.lowC !== null ? 'H ' + formatTemp(data.highC, unit) + '  L ' + formatTemp(data.lowC, unit) : '';
	const temp = formatTemp(data.tempC, unit);
	// the next hours only from a reading under an hour old (an older one would list hours already gone)
	// and only hours still to come: 1 to 12 hours after the current one (a reading from late in the last hour can still
	// list the hour that has now begun)
	const hourNow = new Date(now).getHours();
	const hours = showHours && data.hours && now - data.at < 3600000 ? data.hours.filter((h) => { const ahead = (h.hour - hourNow + 24) % 24; return ahead >= 1 && ahead <= 12; }).map((h) => ({hour: h.hour, temp: formatTemp(h.tempC, unit), icon: describe(h.code, h.isDay).icon})) : [];
	return {icon: d.icon, main: temp + ' ' + d.text, temp, text: d.text, range, city: cityName, hours};
}

export function isFresh (data: WeatherData | null, lat: number, lon: number, now: number): boolean {
	return !!data && data.lat === lat && data.lon === lon && now - data.at < FRESH_MS && now >= data.at;
}

/** The saved reading, if it is for this place and not too old. */
export function usableCached (data: WeatherData | null, lat: number, lon: number, now: number): WeatherData | null {
	return data && data.lat === lat && data.lon === lon && now - data.at < SHOWN_MS && now >= data.at ? data : null;
}

function dayMinute (v: unknown): number | null {
	const n = num(v);
	return n !== null && n >= 0 && n < 1440 ? n : null;
}

/** The next hours as saved (kept so they show at start-up too, before the next reading). */
function savedHours (list: unknown): HourData[] {
	if (!Array.isArray(list)) return [];
	return list.filter((h) => h && num(h.hour) !== null && h.hour >= 0 && h.hour <= 23 && num(h.tempC) !== null && num(h.code) !== null)
		.slice(0, 3).map((h) => ({hour: h.hour, tempC: h.tempC, code: h.code, isDay: h.isDay !== false}));
}

export function readWeatherCache (): WeatherData | null {
	try {
		const raw = localStorage.getItem(WEATHER_CACHE_KEY);
		if (!raw) return null;
		const d = JSON.parse(raw);
		if (!validCoords(d.lat, d.lon) || num(d.tempC) === null || num(d.code) === null || num(d.at) === null) return null;
		return {lat: d.lat, lon: d.lon, tempC: d.tempC, highC: num(d.highC), lowC: num(d.lowC), code: d.code, isDay: d.isDay !== false, at: d.at, hours: savedHours(d.hours), sunrise: dayMinute(d.sunrise), sunset: dayMinute(d.sunset)};
	} catch {
		return null;
	}
}

export function writeWeatherCache (data: WeatherData): void {
	try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(data)); } catch { /* storage full: it is just fetched again */ }
}
