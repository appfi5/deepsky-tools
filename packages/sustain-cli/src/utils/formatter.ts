export function formatEtaMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) {
    return "unknown";
  }

  if (minutes < 60) {
    return `${minutes.toFixed(2)} min`;
  }

  const hours = minutes / 60;
  if (hours < 24) {
    return `${hours.toFixed(2)} h`;
  }

  return `${(hours / 24).toFixed(2)} d`;
}
