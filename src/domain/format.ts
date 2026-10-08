import { addDays, parseLocalDate } from './dates';

const shortMonth = (date: Date) => new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(date).replace('.', '');

export function dateLong(iso: string) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseLocalDate(iso));
}

export function weekLabel(start: string) {
  const a = parseLocalDate(start); const b = parseLocalDate(addDays(start, 6));
  const monthA = shortMonth(a); const monthB = shortMonth(b);
  return monthA === monthB ? `${a.getDate()}–${b.getDate()} ${monthB}` : `${a.getDate()} ${monthA} – ${b.getDate()} ${monthB}`;
}

export function dayMonth(iso: string) {
  return shortMonth(parseLocalDate(iso));
}

export function numberText(n?: number) {
  return n === undefined ? '' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n);
}
