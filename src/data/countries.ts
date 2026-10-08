import type { Country, Region } from '../types';

export const TOTAL_COUNTRIES = 195;

export const REGIONS: Region[] = ['Asia', 'Europe', 'Africa', 'North America', 'South America', 'Oceania'];

const CODES: Record<Region, string> = {
  Asia:
    'JP KR CN TW HK MO TH VN MY SG ID PH KH LA MM BN TL IN PK BD LK NP BT MV MN KZ UZ KG TJ TM AF IR IQ SA AE QA BH KW OM YE JO LB SY IL PS TR GE AM AZ',
  Europe:
    'GB IE FR DE IT ES PT NL BE LU CH AT DK NO SE FI IS PL CZ SK HU SI HR BA RS ME MK AL GR BG RO MD UA BY LT LV EE RU MT CY MC SM VA AD LI XK',
  Africa:
    'EG MA DZ TN LY SD SS ET ER DJ SO KE UG TZ RW BI CD CG CM GA GQ CF TD NE NG BJ TG GH CI LR SL GN GW SN GM ML BF MR CV ST AO ZM ZW MW MZ MG MU SC KM NA BW ZA LS SZ',
  'North America': 'US CA MX GT BZ SV HN NI CR PA CU JM HT DO BS BB TT PR AG DM GD KN LC VC',
  'South America': 'BR AR CL PE CO VE EC BO PY UY GY SR',
  Oceania: 'AU NZ FJ PG SB VU WS TO KI TV NR PW FM MH',
};

const NAME_OVERRIDES: Record<string, string> = {
  HK: 'Hong Kong',
  MO: 'Macau',
  MM: 'Myanmar',
  PS: 'Palestine',
  CD: 'DR Congo',
  CG: 'Congo',
  CI: "Côte d'Ivoire",
  XK: 'Kosovo',
  US: 'United States',
  GB: 'United Kingdom',
  VA: 'Vatican City',
};

let displayNames: Intl.DisplayNames | null = null;
try {
  displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  displayNames = null;
}

export function flagOf(code: string): string {
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0)));
}

export function countryName(code: string): string {
  if (NAME_OVERRIDES[code]) return NAME_OVERRIDES[code];
  try {
    return displayNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

export const COUNTRIES: Country[] = REGIONS.flatMap((region) =>
  CODES[region].split(' ').map((code) => ({ code, region, name: countryName(code), flag: flagOf(code) })),
).sort((a, b) => a.name.localeCompare(b.name));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function getCountry(code: string): Country {
  return BY_CODE.get(code) ?? { code, name: countryName(code), region: 'Asia', flag: flagOf(code) };
}

export function regionOf(code: string): Region {
  return getCountry(code).region;
}
