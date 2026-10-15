(function (root) {
  "use strict";

  // ISO 3166-1 alpha-2, plus XK for Kosovo (commonly exposed by CLDR services).
  const REGION_CODES = (`
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW
`).trim().split(/\s+/);

  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

  // X sometimes exposes a broad region instead of an ISO country. Keep these
  // labels verbatim because they are compared with the About-page value.
  const X_REGIONS = Object.freeze([
    ["Caribbean", "🌎"], ["Central Africa", "🌍"], ["Central America", "🌎"],
    ["Central Asia", "🌏"], ["East Africa", "🌍"], ["East Asia", "🌏"],
    ["Eastern Europe", "🌍"], ["North Africa", "🌍"], ["North America", "🌎"],
    ["Northern Europe", "🌍"], ["Oceania", "🌏"], ["South America", "🌎"],
    ["South Asia", "🌏"], ["Southeast Asia", "🌏"], ["Southern Africa", "🌍"],
    ["Southern Europe", "🌍"], ["West Africa", "🌍"], ["West Asia", "🌏"],
    ["Western Europe", "🌍"]
  ].map(([name, flag]) => Object.freeze({ code: `X-${name}`, name, flag, type: "region" })));

  function countryName(code) {
    return displayNames.of(code) || code;
  }

  function countryFlag(code) {
    if (!/^[A-Z]{2}$/.test(code)) return "🌐";
    return String.fromCodePoint(...code.split("").map((letter) => 127397 + letter.charCodeAt(0)));
  }

  const COUNTRIES = Object.freeze(REGION_CODES
    .map((code) => Object.freeze({ code, name: countryName(code), flag: countryFlag(code), type: "country" }))
    .sort((a, b) => a.name.localeCompare(b.name, "en")));
  const LOCATIONS = Object.freeze([...X_REGIONS, ...COUNTRIES]);

  const api = { REGION_CODES, X_REGIONS, COUNTRIES, LOCATIONS, countryName, countryFlag };
  root.XGeoCountries = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
