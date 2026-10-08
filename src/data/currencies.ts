import { COUNTRIES, flagOf } from './countries';

/** Local currency of each country in the app's list (ISO 3166 → ISO 4217). */
const SHARED: Record<string, string> = {
  EUR: 'FR DE IT ES PT NL BE LU AT FI IE SK SI GR MT CY EE LV LT HR BG MC SM VA AD ME XK',
  USD: 'US EC SV PA TL PR PW FM MH ZW',
  XOF: 'BJ BF CI GW ML NE SN TG',
  XAF: 'CM CF TD CG GQ GA',
  XCD: 'AG DM GD KN LC VC',
  AUD: 'AU KI NR TV',
  CHF: 'CH LI',
  ILS: 'IL PS',
};

const SINGLE =
  'JP:JPY KR:KRW CN:CNY TW:TWD HK:HKD MO:MOP TH:THB VN:VND MY:MYR SG:SGD ID:IDR PH:PHP KH:KHR LA:LAK MM:MMK BN:BND ' +
  'IN:INR PK:PKR BD:BDT LK:LKR NP:NPR BT:BTN MV:MVR MN:MNT KZ:KZT UZ:UZS KG:KGS TJ:TJS TM:TMT AF:AFN IR:IRR IQ:IQD ' +
  'SA:SAR AE:AED QA:QAR BH:BHD KW:KWD OM:OMR YE:YER JO:JOD LB:LBP SY:SYP TR:TRY GE:GEL AM:AMD AZ:AZN ' +
  'GB:GBP DK:DKK NO:NOK SE:SEK IS:ISK PL:PLN CZ:CZK HU:HUF BA:BAM RS:RSD MK:MKD AL:ALL RO:RON MD:MDL UA:UAH BY:BYN RU:RUB ' +
  'EG:EGP MA:MAD DZ:DZD TN:TND LY:LYD SD:SDG SS:SSP ET:ETB ER:ERN DJ:DJF SO:SOS KE:KES UG:UGX TZ:TZS RW:RWF BI:BIF CD:CDF ' +
  'NG:NGN GH:GHS LR:LRD SL:SLE GN:GNF GM:GMD MR:MRU CV:CVE ST:STN AO:AOA ZM:ZMW MW:MWK MZ:MZN MG:MGA MU:MUR SC:SCR KM:KMF ' +
  'NA:NAD BW:BWP ZA:ZAR LS:LSL SZ:SZL ' +
  'CA:CAD MX:MXN GT:GTQ BZ:BZD HN:HNL NI:NIO CR:CRC CU:CUP JM:JMD HT:HTG DO:DOP BS:BSD BB:BBD TT:TTD ' +
  'BR:BRL AR:ARS CL:CLP PE:PEN CO:COP VE:VES BO:BOB PY:PYG UY:UYU GY:GYD SR:SRD ' +
  'NZ:NZD FJ:FJD PG:PGK SB:SBD VU:VUV WS:WST TO:TOP';

const MAP = new Map<string, string>([
  ...Object.entries(SHARED).flatMap(([cur, codes]) => codes.split(' ').map((c) => [c, cur] as [string, string])),
  ...SINGLE.split(' ').map((pair) => pair.split(':') as [string, string]),
]);

export const currencyOf = (countryCode: string): string => MAP.get(countryCode) ?? 'USD';

/** Best guess at the user's home currency from the browser locale (e.g. en-MY → MYR). */
export function guessHomeCurrency(): string {
  for (const loc of [...(navigator.languages ?? []), navigator.language]) {
    const region = loc?.split('-')[1]?.toUpperCase();
    if (region && MAP.has(region)) return MAP.get(region)!;
  }
  return 'USD';
}

/** Every local currency above — always offered in pickers. */
export const LOCAL_CURRENCIES = new Set(MAP.values());

const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));

/** A flag for a currency: its country (JPY → 🇯🇵), the EU for EUR, else a generic money sign. */
export function currencyFlag(code: string): string {
  if (code === 'EUR') return flagOf('EU');
  const cc = code.slice(0, 2);
  return COUNTRY_CODES.has(cc) ? flagOf(cc) : '💱';
}
