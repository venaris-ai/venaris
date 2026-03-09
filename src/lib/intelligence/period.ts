export type PeriodKey = "24h" | "7d" | "30d";

export function resolvePeriodRange(period: PeriodKey, now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);

  if (period === "24h") {
    start.setHours(start.getHours() - 24);
  } else if (period === "7d") {
    start.setDate(start.getDate() - 7);
  } else if (period === "30d") {
    start.setDate(start.getDate() - 30);
  } else {
    throw new Error(`Unsupported period: ${period}`);
  }

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}