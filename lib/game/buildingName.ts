/** Flag / town display names. Player usernames stay 24; this is longer for `Owner - Place`. */
export const BUILDING_NAME_MAX = 48;

const PLACES = [
  // Real
  "York",
  "Oxford",
  "Cambridge",
  "Bristol",
  "Salem",
  "Kyoto",
  "Cairo",
  "Lisbon",
  "Prague",
  "Vienna",
  "Dublin",
  "Naples",
  "Geneva",
  "Oslo",
  "Toledo",
  "Seville",
  "Florence",
  "Venice",
  "Cordoba",
  "Bergen",
  "Alexandria",
  "Damascus",
  "Samarkand",
  "Kashmir",
  "Yukon",
  "Cornwall",
  "Provence",
  "Tuscany",
  // Fantasy / literary
  "Rivendell",
  "Gondor",
  "Rohan",
  "Hobbiton",
  "Mordor",
  "Isengard",
  "Edoras",
  "Lothlorien",
  "Winterfell",
  "Riverrun",
  "Narnia",
  "Cair Paravel",
  "Earthsea",
  "Gormenghast",
  "Ankh-Morpork",
  "Neverwinter",
  "Waterdeep",
  "Whiterun",
  "Riften",
  "Stormwind",
  "The Shire",
  "Minas Tirith",
] as const;

function pickPlace(): string {
  return PLACES[Math.floor(Math.random() * PLACES.length)]!;
}

/** `{owner} - Rivendell` — duplicates allowed. */
export function suggestedBuildingName(ownerName: string): string {
  const owner = ownerName.trim() || "Traveler";
  const place = pickPlace();
  const suffix = ` - ${place}`;
  const room = BUILDING_NAME_MAX - suffix.length;
  const head = owner.slice(0, Math.max(1, room));
  return `${head}${suffix}`.slice(0, BUILDING_NAME_MAX);
}

export function isNamedBuildKind(kind: string): kind is "flag" | "town" {
  return kind === "flag" || kind === "town";
}
