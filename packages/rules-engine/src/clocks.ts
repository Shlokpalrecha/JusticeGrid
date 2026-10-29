const DAY = 86_400_000;
export function instant(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new Error("Expected an ISO instant with timezone");
  const n = Date.parse(value);
  if (!Number.isFinite(n)) throw new Error("Invalid instant");
  const datePart = value.slice(0, 10);
  if (new Date(datePart + "T00:00:00Z").toISOString().slice(0, 10) !== datePart)
    throw new Error("Invalid instant civil date");
  return n;
}
export function civil(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(value + "T00:00:00Z");
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
      throw new Error("Invalid civil date");
    return value;
  }
  return new Date(instant(value) + 19_800_000).toISOString().slice(0, 10);
}
export function calendarDays(from: string, to: string): number {
  return (Date.parse(civil(to)) - Date.parse(civil(from))) / DAY;
}
export function addHours(value: string, hours: number): string {
  return new Date(instant(value) + hours * 3_600_000).toISOString();
}
export function addCalendarDays(value: string, days: number): string {
  return new Date(instant(value) + days * DAY).toISOString();
}
export function addMonths(value: string, months: number): string {
  const d = new Date(instant(value) + 19_800_000);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, end));
  return new Date(d.getTime() - 19_800_000).toISOString();
}
export function nextCommitteeMeeting(value: string, holidays: string[]): string {
  const start = civil(value);
  for (let i = 0; i < 70; i++) {
    const day = new Date(Date.parse(start) + i * DAY);
    const date = day.getUTCDate();
    if (day.getUTCDay() !== 1 || !((date >= 1 && date <= 7) || (date >= 15 && date <= 21)))
      continue;
    while (
      day.getUTCDay() === 0 ||
      day.getUTCDay() === 6 ||
      holidays.includes(day.toISOString().slice(0, 10))
    )
      day.setUTCDate(day.getUTCDate() + 1);
    return day.toISOString().slice(0, 10) + "T09:00:00+05:30";
  }
  throw new Error("Committee calendar unavailable");
}

export function calendarEndOfNextDay(value: string): string {
  return new Date(Date.parse(civil(value)) + 2 * 86400000 - 19800000 - 1).toISOString();
}
