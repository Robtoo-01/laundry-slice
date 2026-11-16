// The business runs on East Africa Time; the database stores UTC.
import { LOCALE, TIME_ZONE as ZONE } from './config';

function zoneOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The UTC instant of a local wall-clock time. `month` is 1 to 12. */
export function localToUtc(year: number, month: number, day: number, hour: number): Date {
  const wall = Date.UTC(year, month - 1, day, hour);
  const guess = new Date(wall - zoneOffsetMinutes(new Date(wall)) * 60000);
  return new Date(wall - zoneOffsetMinutes(guess) * 60000);
}

export function formatLocal(at: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: ZONE,
    hourCycle: 'h23',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

/** Today's calendar date in the business's time zone. */
export function localToday(now = new Date()): { year: number; month: number; day: number } {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE })
    .format(now)
    .split('-')
    .map(Number);
  return { year, month, day };
}
