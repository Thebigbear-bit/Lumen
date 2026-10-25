// Night mode (Settings → Look): between sunset and sunrise (or 10 PM and 7 AM) the home screen dims its wallpaper
// and softens the clock. Checked with the clock's own once-a-minute tick, so it costs nothing extra.

import type {NightMode} from './storage';

const LATE_FROM = 22 * 60;
const LATE_TO = 7 * 60;

/** Is `minute` (minutes after midnight) at night? Sunrise and sunset are minutes after midnight, null when unknown
 *  (then the fixed 10 PM to 7 AM is used). */
export function isNight (minute: number, mode: NightMode, sunrise?: number | null, sunset?: number | null): boolean {
	if (mode === 'off') return false;
	const useSun = mode === 'sun' && typeof sunrise === 'number' && typeof sunset === 'number' && sunrise < sunset;
	const from = useSun ? sunset as number : LATE_FROM;
	const to = useSun ? sunrise as number : LATE_TO;
	return minute >= from || minute < to;
}
