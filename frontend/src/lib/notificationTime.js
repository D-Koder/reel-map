// Booking notifications hold their time as {{2026-11-12T08:00:00Z}}. This shows it in this device's time zone:
// "12 Nov, 7:00 pm" in Melbourne, "11 Nov, 8:00 am" in London.
export function localTimes(text) {
  return String(text ?? '').replace(/\{\{([^}]+)\}\}/g, (match, iso) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  });
}
