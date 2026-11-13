// The person's country, read from the phone's region setting (en-AU gives Australia), so sign-up does not have to ask.
// This is the language and region the phone is set to, not its GPS position, so there is no permission prompt.
// Returns '' when the phone gives no region (plain "en"), and the profile just has no country.
export function deviceCountry(languages = globalThis.navigator?.languages ?? [globalThis.navigator?.language]) {
  for (const tag of languages ?? []) {
    try {
      const region = new Intl.Locale(String(tag)).region;
      if (!region) continue;
      const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(region);
      if (name && name !== region) return name;
    } catch { /* a tag the browser cannot read: try the next */ }
  }
  return '';
}
