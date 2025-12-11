export type Country = {
  code3: string;
  name: string;
  flag: string; // emoji
};

export const COUNTRIES_32: Country[] = [
  { code3: "USA", flag: "🇺🇸", name: "United States" },
  { code3: "CAN", flag: "🇨🇦", name: "Canada" },
  { code3: "MEX", flag: "🇲🇽", name: "Mexico" },
  { code3: "BRA", flag: "🇧🇷", name: "Brazil" },
  { code3: "ARG", flag: "🇦🇷", name: "Argentina" },
  { code3: "URU", flag: "🇺🇾", name: "Uruguay" },
  { code3: "COL", flag: "🇨🇴", name: "Colombia" },
  { code3: "CHI", flag: "🇨🇱", name: "Chile" },
  { code3: "ENG", flag: "🏴", name: "England" },
  { code3: "FRA", flag: "🇫🇷", name: "France" },
  { code3: "GER", flag: "🇩🇪", name: "Germany" },
  { code3: "ESP", flag: "🇪🇸", name: "Spain" },
  { code3: "POR", flag: "🇵🇹", name: "Portugal" },
  { code3: "ITA", flag: "🇮🇹", name: "Italy" },
  { code3: "NED", flag: "🇳🇱", name: "Netherlands" },
  { code3: "BEL", flag: "🇧🇪", name: "Belgium" },
  { code3: "CRO", flag: "🇭🇷", name: "Croatia" },
  { code3: "SUI", flag: "🇨🇭", name: "Switzerland" },
  { code3: "DEN", flag: "🇩🇰", name: "Denmark" },
  { code3: "POL", flag: "🇵🇱", name: "Poland" },
  { code3: "SRB", flag: "🇷🇸", name: "Serbia" },
  { code3: "SWE", flag: "🇸🇪", name: "Sweden" },
  { code3: "JPN", flag: "🇯🇵", name: "Japan" },
  { code3: "KOR", flag: "🇰🇷", name: "South Korea" },
  { code3: "AUS", flag: "🇦🇺", name: "Australia" },
  { code3: "IRN", flag: "🇮🇷", name: "Iran" },
  { code3: "KSA", flag: "🇸🇦", name: "Saudi Arabia" },
  { code3: "MAR", flag: "🇲🇦", name: "Morocco" },
  { code3: "SEN", flag: "🇸🇳", name: "Senegal" },
  { code3: "NGA", flag: "🇳🇬", name: "Nigeria" },
  { code3: "CMR", flag: "🇨🇲", name: "Cameroon" },
  { code3: "EGY", flag: "🇪🇬", name: "Egypt" },
];

export const COUNTRY_BY_CODE3 = new Map(COUNTRIES_32.map((c) => [c.code3, c] as const));

/**
 * Kilo is the player-controlled team, not a real-world country.
 * Tournament opponents are always countries from [`COUNTRIES_32`](lib/data/countries.ts:1).
 */
export const KILO_TEAM = {
  kind: "team" as const,
  id: "kilo",
  code3: "KIL",
  name: "Kilo",
  flag: "🏆",
};

export type KiloTeam = typeof KILO_TEAM;