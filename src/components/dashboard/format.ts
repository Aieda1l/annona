/** Instants stay server UTC strings; they are only rendered in Pacific time with the zone shown. */
export function formatPacific(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
    .format(new Date(iso))
    .replace(",", "")
    .replace(/ /g, " ");
}
