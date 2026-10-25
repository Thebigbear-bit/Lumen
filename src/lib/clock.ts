// Time-of-day text. Pure functions so they are trivially testable.

export type TimeFormat = '12h' | '24h';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function greeting (date: Date): string {
	const h = date.getHours();
	if (h < 12) return 'Good morning';
	if (h < 18) return 'Good afternoon';
	return 'Good evening';
}

export function dayName (date: Date): string {
	return DAYS[date.getDay()];
}

/** "23 September" */
export function dateText (date: Date): string {
	return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "Sunday, 11 October 2026" */
export function fullDate (date: Date): string {
	return `${dayName(date)}, ${dateText(date)} ${date.getFullYear()}`;
}

export interface TimeParts {
	/** "15:42" or "3:42" */
	time: string;
	/** "AM" / "PM" in 12-hour format, otherwise empty */
	period: string;
}

export function timeParts (date: Date, format: TimeFormat): TimeParts {
	const h = date.getHours();
	const m = pad(date.getMinutes());
	if (format === '24h') return {time: `${pad(h)}:${m}`, period: ''};
	return {time: `${h % 12 || 12}:${m}`, period: h < 12 ? 'AM' : 'PM'};
}

function pad (n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

/** How far (px) to move the clock up so its bottom stays `gap` above `limit` (the top of the app row), without
 *  moving its top above `minTop`. `top` and `bottom` are where it is drawn when not moved. 0 when it already fits. */
export function liftToClear (top: number, bottom: number, limit: number, gap: number, minTop: number): number {
	const needed = bottom + gap - limit;
	if (needed <= 0) return 0;
	return Math.max(0, Math.min(needed, top - minTop));
}

export interface CardFit {
	/** px to move the cards up (centred layout) */
	lift: number;
	/** the weather card keeps its own height instead of matching the clock card */
	compact: boolean;
	/** 1, or less when the cards must shrink to fit (corner layout) */
	scale: number;
}

/** Fits the Glass cards above the app row. `top` is where the cards start, `height` and `compactHeight` their
 *  height with two equal cards and with the weather card at its own height, and `limit` the top of the app row.
 *  Centred cards may move up (not above `minTop`); cards in the corner stay where they are and shrink instead. */
export function fitCards (corner: boolean, top: number, height: number, compactHeight: number, limit: number, gap: number, minTop: number): CardFit {
	const room = limit - gap;
	if (corner) {
		if (top + height <= room) return {lift: 0, compact: false, scale: 1};
		if (top + compactHeight <= room) return {lift: 0, compact: true, scale: 1};
		return {lift: 0, compact: true, scale: Math.max(0.4, Math.floor((room - top) / compactHeight * 100) / 100)};
	}
	const lift = liftToClear(top, top + height, limit, gap, minTop);
	if (top - lift + height <= room) return {lift, compact: false, scale: 1};
	return {lift: liftToClear(top, top + compactHeight, limit, gap, minTop), compact: true, scale: 1};
}
