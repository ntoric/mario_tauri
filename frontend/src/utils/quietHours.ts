// Nightly pause window: between 00:30 and 07:30 IST all client-side polling
// must be skipped (the backend pauses its background workers in the same
// window; only the 03:00 request-log cleanup still runs).
export const isQuietHours = (d: Date = new Date()): boolean => {
  const istMinutes = (d.getUTCHours() * 60 + d.getUTCMinutes() + 330) % 1440;
  return istMinutes >= 30 && istMinutes < 450;
};
