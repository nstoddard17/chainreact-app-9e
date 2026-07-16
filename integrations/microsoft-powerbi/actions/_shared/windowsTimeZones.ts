import type { FieldOption } from "@/contracts/actionMeta";

/**
 * Curated Windows time-zone ids for Power BI refresh-schedule fields
 * (`localTimeZoneId` on the semantic-model + dataflow schedule actions).
 *
 * **Power BI expects a WINDOWS time-zone id** ("Pacific Standard Time"),
 * NOT an IANA name ("America/Los_Angeles") — so the repo's
 * `type: "timezone"` renderer, which stores IANA names, is WRONG for
 * these fields and is deliberately not used. These render as a
 * `type: "select"` with this static list instead.
 *
 * The Windows zone set is a fixed Microsoft enumeration; only ids that
 * are certain are listed here. It is a deliberate SUBSET (the common
 * business zones across the Americas, Europe, Africa, Asia, and
 * Oceania) — hence the fields stay optional strings with no zod enum:
 * a legitimate Windows id outside this list must still save (and any
 * config saved before this list existed must keep working).
 *
 * Ordered by UTC offset (west → east). Labels carry the zone's STANDARD
 * -time offset; ids do not encode DST, which Power BI applies itself.
 *
 * Defined ONCE here and imported by both schedule metas — never copied.
 */
export const POWERBI_WINDOWS_TIME_ZONE_OPTIONS: readonly FieldOption[] = [
  { value: "Dateline Standard Time", label: "(UTC-12:00) International Date Line West — Dateline Standard Time" },
  { value: "Hawaiian Standard Time", label: "(UTC-10:00) Hawaii — Hawaiian Standard Time" },
  { value: "Alaskan Standard Time", label: "(UTC-09:00) Alaska — Alaskan Standard Time" },
  { value: "Pacific Standard Time", label: "(UTC-08:00) Pacific Time (US & Canada) — Pacific Standard Time" },
  { value: "Mountain Standard Time", label: "(UTC-07:00) Mountain Time (US & Canada) — Mountain Standard Time" },
  { value: "US Mountain Standard Time", label: "(UTC-07:00) Arizona — US Mountain Standard Time" },
  { value: "Central Standard Time", label: "(UTC-06:00) Central Time (US & Canada) — Central Standard Time" },
  { value: "Central America Standard Time", label: "(UTC-06:00) Central America — Central America Standard Time" },
  { value: "Canada Central Standard Time", label: "(UTC-06:00) Saskatchewan — Canada Central Standard Time" },
  { value: "Eastern Standard Time", label: "(UTC-05:00) Eastern Time (US & Canada) — Eastern Standard Time" },
  { value: "US Eastern Standard Time", label: "(UTC-05:00) Indiana (East) — US Eastern Standard Time" },
  { value: "SA Pacific Standard Time", label: "(UTC-05:00) Bogota, Lima, Quito — SA Pacific Standard Time" },
  { value: "Atlantic Standard Time", label: "(UTC-04:00) Atlantic Time (Canada) — Atlantic Standard Time" },
  { value: "SA Western Standard Time", label: "(UTC-04:00) Georgetown, La Paz, San Juan — SA Western Standard Time" },
  { value: "Pacific SA Standard Time", label: "(UTC-04:00) Santiago — Pacific SA Standard Time" },
  { value: "Newfoundland Standard Time", label: "(UTC-03:30) Newfoundland — Newfoundland Standard Time" },
  { value: "E. South America Standard Time", label: "(UTC-03:00) Brasilia — E. South America Standard Time" },
  { value: "Argentina Standard Time", label: "(UTC-03:00) Buenos Aires — Argentina Standard Time" },
  { value: "Montevideo Standard Time", label: "(UTC-03:00) Montevideo — Montevideo Standard Time" },
  { value: "SA Eastern Standard Time", label: "(UTC-03:00) Cayenne, Fortaleza — SA Eastern Standard Time" },
  { value: "Cape Verde Standard Time", label: "(UTC-01:00) Cabo Verde Is. — Cape Verde Standard Time" },
  { value: "Azores Standard Time", label: "(UTC-01:00) Azores — Azores Standard Time" },
  { value: "UTC", label: "(UTC+00:00) Coordinated Universal Time — UTC" },
  { value: "GMT Standard Time", label: "(UTC+00:00) Dublin, Edinburgh, Lisbon, London — GMT Standard Time" },
  { value: "Greenwich Standard Time", label: "(UTC+00:00) Monrovia, Reykjavik — Greenwich Standard Time" },
  { value: "W. Europe Standard Time", label: "(UTC+01:00) Amsterdam, Berlin, Rome, Stockholm, Vienna — W. Europe Standard Time" },
  { value: "Romance Standard Time", label: "(UTC+01:00) Brussels, Copenhagen, Madrid, Paris — Romance Standard Time" },
  { value: "Central Europe Standard Time", label: "(UTC+01:00) Belgrade, Bratislava, Budapest, Ljubljana, Prague — Central Europe Standard Time" },
  { value: "Central European Standard Time", label: "(UTC+01:00) Sarajevo, Skopje, Warsaw, Zagreb — Central European Standard Time" },
  { value: "W. Central Africa Standard Time", label: "(UTC+01:00) West Central Africa (Lagos) — W. Central Africa Standard Time" },
  { value: "GTB Standard Time", label: "(UTC+02:00) Athens, Bucharest — GTB Standard Time" },
  { value: "FLE Standard Time", label: "(UTC+02:00) Helsinki, Kyiv, Riga, Sofia, Tallinn, Vilnius — FLE Standard Time" },
  { value: "E. Europe Standard Time", label: "(UTC+02:00) Chisinau — E. Europe Standard Time" },
  { value: "Egypt Standard Time", label: "(UTC+02:00) Cairo — Egypt Standard Time" },
  { value: "South Africa Standard Time", label: "(UTC+02:00) Harare, Pretoria — South Africa Standard Time" },
  { value: "Israel Standard Time", label: "(UTC+02:00) Jerusalem — Israel Standard Time" },
  { value: "Turkey Standard Time", label: "(UTC+03:00) Istanbul — Turkey Standard Time" },
  { value: "Arab Standard Time", label: "(UTC+03:00) Kuwait, Riyadh — Arab Standard Time" },
  { value: "Russian Standard Time", label: "(UTC+03:00) Moscow, St. Petersburg — Russian Standard Time" },
  { value: "E. Africa Standard Time", label: "(UTC+03:00) Nairobi — E. Africa Standard Time" },
  { value: "Iran Standard Time", label: "(UTC+03:30) Tehran — Iran Standard Time" },
  { value: "Arabian Standard Time", label: "(UTC+04:00) Abu Dhabi, Muscat — Arabian Standard Time" },
  { value: "Azerbaijan Standard Time", label: "(UTC+04:00) Baku — Azerbaijan Standard Time" },
  { value: "Georgian Standard Time", label: "(UTC+04:00) Tbilisi — Georgian Standard Time" },
  { value: "Afghanistan Standard Time", label: "(UTC+04:30) Kabul — Afghanistan Standard Time" },
  { value: "West Asia Standard Time", label: "(UTC+05:00) Ashgabat, Tashkent — West Asia Standard Time" },
  { value: "Pakistan Standard Time", label: "(UTC+05:00) Islamabad, Karachi — Pakistan Standard Time" },
  { value: "India Standard Time", label: "(UTC+05:30) Chennai, Kolkata, Mumbai, New Delhi — India Standard Time" },
  { value: "Sri Lanka Standard Time", label: "(UTC+05:30) Sri Jayawardenepura — Sri Lanka Standard Time" },
  { value: "Nepal Standard Time", label: "(UTC+05:45) Kathmandu — Nepal Standard Time" },
  { value: "Central Asia Standard Time", label: "(UTC+06:00) Astana — Central Asia Standard Time" },
  { value: "Bangladesh Standard Time", label: "(UTC+06:00) Dhaka — Bangladesh Standard Time" },
  { value: "Myanmar Standard Time", label: "(UTC+06:30) Yangon (Rangoon) — Myanmar Standard Time" },
  { value: "SE Asia Standard Time", label: "(UTC+07:00) Bangkok, Hanoi, Jakarta — SE Asia Standard Time" },
  { value: "North Asia Standard Time", label: "(UTC+07:00) Krasnoyarsk — North Asia Standard Time" },
  { value: "China Standard Time", label: "(UTC+08:00) Beijing, Chongqing, Hong Kong, Urumqi — China Standard Time" },
  { value: "Singapore Standard Time", label: "(UTC+08:00) Kuala Lumpur, Singapore — Singapore Standard Time" },
  { value: "Taipei Standard Time", label: "(UTC+08:00) Taipei — Taipei Standard Time" },
  { value: "W. Australia Standard Time", label: "(UTC+08:00) Perth — W. Australia Standard Time" },
  { value: "Tokyo Standard Time", label: "(UTC+09:00) Osaka, Sapporo, Tokyo — Tokyo Standard Time" },
  { value: "Korea Standard Time", label: "(UTC+09:00) Seoul — Korea Standard Time" },
  { value: "Cen. Australia Standard Time", label: "(UTC+09:30) Adelaide — Cen. Australia Standard Time" },
  { value: "AUS Central Standard Time", label: "(UTC+09:30) Darwin — AUS Central Standard Time" },
  { value: "E. Australia Standard Time", label: "(UTC+10:00) Brisbane — E. Australia Standard Time" },
  { value: "AUS Eastern Standard Time", label: "(UTC+10:00) Canberra, Melbourne, Sydney — AUS Eastern Standard Time" },
  { value: "Tasmania Standard Time", label: "(UTC+10:00) Hobart — Tasmania Standard Time" },
  { value: "West Pacific Standard Time", label: "(UTC+10:00) Guam, Port Moresby — West Pacific Standard Time" },
  { value: "Central Pacific Standard Time", label: "(UTC+11:00) Solomon Is., New Caledonia — Central Pacific Standard Time" },
  { value: "New Zealand Standard Time", label: "(UTC+12:00) Auckland, Wellington — New Zealand Standard Time" },
  { value: "Fiji Standard Time", label: "(UTC+12:00) Fiji — Fiji Standard Time" },
  { value: "Tonga Standard Time", label: "(UTC+13:00) Nuku'alofa — Tonga Standard Time" },
];
