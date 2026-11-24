export function isValidCalendarRange(start: string, end: string): boolean {
  const hasOffset = /(Z|[+-]\d{2}:\d{2})$/i;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return (
    hasOffset.test(start) &&
    hasOffset.test(end) &&
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    endMs > startMs &&
    endMs - startMs <= 42 * 24 * 60 * 60 * 1000
  );
}
