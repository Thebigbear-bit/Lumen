// The weather city from the TV's own time zone setting (Settings → General → Time on the TV), e.g. "Copenhagen,
// Denmark". Read once, on a fresh install that still has the default city, so the weather shows the right place without
// asking. Nothing about the TV is sent anywhere: only the city's name goes to Open-Meteo's place search.

import {lunaCall} from './luna';
import type {City} from './weather';

export interface TvPlace {city: string; country: string}

/** The city and country of the TV's time zone, or null when the TV does not say. */
export function readTvPlace (): Promise<TvPlace | null> {
	return lunaCall<{settings?: {timeZone?: {City?: unknown; Country?: unknown}}}>(
		'luna://com.webos.settingsservice/getSystemSettings', {category: 'time', keys: ['timeZone']}, 4000
	).then((r) => placeFrom(r.settings && r.settings.timeZone), () => null);
}

export function placeFrom (tz: {City?: unknown; Country?: unknown} | undefined): TvPlace | null {
	if (!tz || typeof tz.City !== 'string' || !tz.City.trim()) return null;
	return {city: tz.City.trim().slice(0, 60), country: typeof tz.Country === 'string' ? tz.Country.trim() : ''};
}

/** The search result in the TV's country (the first one when none is, or the country is unknown). */
export function pickCity (results: City[], country: string): City | null {
	if (!results.length) return null;
	const want = country.toLowerCase();
	const inCountry = want ? results.filter((c) => (c.detail || '').toLowerCase().split(', ').pop() === want)[0] : undefined;
	return inCountry || results[0];
}
