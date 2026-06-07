/**
 * CountrySelect.jsx
 * Searchable, keyboard-navigable country dropdown.
 *
 * Props:
 *   value        {string}   — currently selected country name
 *   onChange     {function} — called with country name string on selection
 *   placeholder  {string}   — input placeholder text
 *   label        {string}   — optional label above the input
 *
 * Renders a flag emoji derived from the ISO 3166-1 alpha-2 code.
 * The full 195-country list is a module-level const so it's built once.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Flag emoji from ISO alpha-2 code ─────────────────────────────────────────
const toFlagEmoji = (code) =>
  code
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");

// ─── Full country list [{name, code}] ─────────────────────────────────────────
export const COUNTRIES = [
  { name: "Afghanistan",                code: "AF" },
  { name: "Albania",                    code: "AL" },
  { name: "Algeria",                    code: "DZ" },
  { name: "Andorra",                    code: "AD" },
  { name: "Angola",                     code: "AO" },
  { name: "Antigua and Barbuda",        code: "AG" },
  { name: "Argentina",                  code: "AR" },
  { name: "Armenia",                    code: "AM" },
  { name: "Australia",                  code: "AU" },
  { name: "Austria",                    code: "AT" },
  { name: "Azerbaijan",                 code: "AZ" },
  { name: "Bahamas",                    code: "BS" },
  { name: "Bahrain",                    code: "BH" },
  { name: "Bangladesh",                 code: "BD" },
  { name: "Barbados",                   code: "BB" },
  { name: "Belarus",                    code: "BY" },
  { name: "Belgium",                    code: "BE" },
  { name: "Belize",                     code: "BZ" },
  { name: "Benin",                      code: "BJ" },
  { name: "Bhutan",                     code: "BT" },
  { name: "Bolivia",                    code: "BO" },
  { name: "Bosnia and Herzegovina",     code: "BA" },
  { name: "Botswana",                   code: "BW" },
  { name: "Brazil",                     code: "BR" },
  { name: "Brunei",                     code: "BN" },
  { name: "Bulgaria",                   code: "BG" },
  { name: "Burkina Faso",               code: "BF" },
  { name: "Burundi",                    code: "BI" },
  { name: "Cabo Verde",                 code: "CV" },
  { name: "Cambodia",                   code: "KH" },
  { name: "Cameroon",                   code: "CM" },
  { name: "Canada",                     code: "CA" },
  { name: "Central African Republic",   code: "CF" },
  { name: "Chad",                       code: "TD" },
  { name: "Chile",                      code: "CL" },
  { name: "China",                      code: "CN" },
  { name: "Colombia",                   code: "CO" },
  { name: "Comoros",                    code: "KM" },
  { name: "Congo (Brazzaville)",        code: "CG" },
  { name: "Congo (DRC)",                code: "CD" },
  { name: "Costa Rica",                 code: "CR" },
  { name: "Croatia",                    code: "HR" },
  { name: "Cuba",                       code: "CU" },
  { name: "Cyprus",                     code: "CY" },
  { name: "Czech Republic",             code: "CZ" },
  { name: "Denmark",                    code: "DK" },
  { name: "Djibouti",                   code: "DJ" },
  { name: "Dominica",                   code: "DM" },
  { name: "Dominican Republic",         code: "DO" },
  { name: "Ecuador",                    code: "EC" },
  { name: "Egypt",                      code: "EG" },
  { name: "El Salvador",                code: "SV" },
  { name: "Equatorial Guinea",          code: "GQ" },
  { name: "Eritrea",                    code: "ER" },
  { name: "Estonia",                    code: "EE" },
  { name: "Eswatini",                   code: "SZ" },
  { name: "Ethiopia",                   code: "ET" },
  { name: "Fiji",                       code: "FJ" },
  { name: "Finland",                    code: "FI" },
  { name: "France",                     code: "FR" },
  { name: "Gabon",                      code: "GA" },
  { name: "Gambia",                     code: "GM" },
  { name: "Georgia",                    code: "GE" },
  { name: "Germany",                    code: "DE" },
  { name: "Ghana",                      code: "GH" },
  { name: "Greece",                     code: "GR" },
  { name: "Grenada",                    code: "GD" },
  { name: "Guatemala",                  code: "GT" },
  { name: "Guinea",                     code: "GN" },
  { name: "Guinea-Bissau",              code: "GW" },
  { name: "Guyana",                     code: "GY" },
  { name: "Haiti",                      code: "HT" },
  { name: "Honduras",                   code: "HN" },
  { name: "Hungary",                    code: "HU" },
  { name: "Iceland",                    code: "IS" },
  { name: "India",                      code: "IN" },
  { name: "Indonesia",                  code: "ID" },
  { name: "Iran",                       code: "IR" },
  { name: "Iraq",                       code: "IQ" },
  { name: "Ireland",                    code: "IE" },
  { name: "Israel",                     code: "IL" },
  { name: "Italy",                      code: "IT" },
  { name: "Ivory Coast",                code: "CI" },
  { name: "Jamaica",                    code: "JM" },
  { name: "Japan",                      code: "JP" },
  { name: "Jordan",                     code: "JO" },
  { name: "Kazakhstan",                 code: "KZ" },
  { name: "Kenya",                      code: "KE" },
  { name: "Kiribati",                   code: "KI" },
  { name: "Kuwait",                     code: "KW" },
  { name: "Kyrgyzstan",                 code: "KG" },
  { name: "Laos",                       code: "LA" },
  { name: "Latvia",                     code: "LV" },
  { name: "Lebanon",                    code: "LB" },
  { name: "Lesotho",                    code: "LS" },
  { name: "Liberia",                    code: "LR" },
  { name: "Libya",                      code: "LY" },
  { name: "Liechtenstein",              code: "LI" },
  { name: "Lithuania",                  code: "LT" },
  { name: "Luxembourg",                 code: "LU" },
  { name: "Madagascar",                 code: "MG" },
  { name: "Malawi",                     code: "MW" },
  { name: "Malaysia",                   code: "MY" },
  { name: "Maldives",                   code: "MV" },
  { name: "Mali",                       code: "ML" },
  { name: "Malta",                      code: "MT" },
  { name: "Marshall Islands",           code: "MH" },
  { name: "Mauritania",                 code: "MR" },
  { name: "Mauritius",                  code: "MU" },
  { name: "Mexico",                     code: "MX" },
  { name: "Micronesia",                 code: "FM" },
  { name: "Moldova",                    code: "MD" },
  { name: "Monaco",                     code: "MC" },
  { name: "Mongolia",                   code: "MN" },
  { name: "Montenegro",                 code: "ME" },
  { name: "Morocco",                    code: "MA" },
  { name: "Mozambique",                 code: "MZ" },
  { name: "Myanmar",                    code: "MM" },
  { name: "Namibia",                    code: "NA" },
  { name: "Nauru",                      code: "NR" },
  { name: "Nepal",                      code: "NP" },
  { name: "Netherlands",                code: "NL" },
  { name: "New Zealand",                code: "NZ" },
  { name: "Nicaragua",                  code: "NI" },
  { name: "Niger",                      code: "NE" },
  { name: "Nigeria",                    code: "NG" },
  { name: "North Korea",                code: "KP" },
  { name: "North Macedonia",            code: "MK" },
  { name: "Norway",                     code: "NO" },
  { name: "Oman",                       code: "OM" },
  { name: "Pakistan",                   code: "PK" },
  { name: "Palau",                      code: "PW" },
  { name: "Palestine",                  code: "PS" },
  { name: "Panama",                     code: "PA" },
  { name: "Papua New Guinea",           code: "PG" },
  { name: "Paraguay",                   code: "PY" },
  { name: "Peru",                       code: "PE" },
  { name: "Philippines",                code: "PH" },
  { name: "Poland",                     code: "PL" },
  { name: "Portugal",                   code: "PT" },
  { name: "Qatar",                      code: "QA" },
  { name: "Romania",                    code: "RO" },
  { name: "Russia",                     code: "RU" },
  { name: "Rwanda",                     code: "RW" },
  { name: "Saint Kitts and Nevis",      code: "KN" },
  { name: "Saint Lucia",                code: "LC" },
  { name: "Saint Vincent and Grenadines", code: "VC" },
  { name: "Samoa",                      code: "WS" },
  { name: "San Marino",                 code: "SM" },
  { name: "São Tomé and Príncipe",      code: "ST" },
  { name: "Saudi Arabia",               code: "SA" },
  { name: "Senegal",                    code: "SN" },
  { name: "Serbia",                     code: "RS" },
  { name: "Seychelles",                 code: "SC" },
  { name: "Sierra Leone",               code: "SL" },
  { name: "Singapore",                  code: "SG" },
  { name: "Slovakia",                   code: "SK" },
  { name: "Slovenia",                   code: "SI" },
  { name: "Solomon Islands",            code: "SB" },
  { name: "Somalia",                    code: "SO" },
  { name: "South Africa",              code: "ZA" },
  { name: "South Korea",               code: "KR" },
  { name: "South Sudan",               code: "SS" },
  { name: "Spain",                     code: "ES" },
  { name: "Sri Lanka",                 code: "LK" },
  { name: "Sudan",                     code: "SD" },
  { name: "Suriname",                  code: "SR" },
  { name: "Sweden",                    code: "SE" },
  { name: "Switzerland",               code: "CH" },
  { name: "Syria",                     code: "SY" },
  { name: "Taiwan",                    code: "TW" },
  { name: "Tajikistan",                code: "TJ" },
  { name: "Tanzania",                  code: "TZ" },
  { name: "Thailand",                  code: "TH" },
  { name: "Timor-Leste",               code: "TL" },
  { name: "Togo",                      code: "TG" },
  { name: "Tonga",                     code: "TO" },
  { name: "Trinidad and Tobago",       code: "TT" },
  { name: "Tunisia",                   code: "TN" },
  { name: "Turkey",                    code: "TR" },
  { name: "Turkmenistan",              code: "TM" },
  { name: "Tuvalu",                    code: "TV" },
  { name: "Uganda",                    code: "UG" },
  { name: "Ukraine",                   code: "UA" },
  { name: "United Arab Emirates",      code: "AE" },
  { name: "United Kingdom",            code: "GB" },
  { name: "United States",             code: "US" },
  { name: "Uruguay",                   code: "UY" },
  { name: "Uzbekistan",                code: "UZ" },
  { name: "Vanuatu",                   code: "VU" },
  { name: "Vatican City",              code: "VA" },
  { name: "Venezuela",                 code: "VE" },
  { name: "Vietnam",                   code: "VN" },
  { name: "Yemen",                     code: "YE" },
  { name: "Zambia",                    code: "ZM" },
  { name: "Zimbabwe",                  code: "ZW" },
].map((c) => ({ ...c, flag: toFlagEmoji(c.code) }));

// ─── Component ────────────────────────────────────────────────────────────────

export default function CountrySelect({
  value       = "",
  onChange,
  placeholder = "Search country…",
  label       = "",
}) {
  const [query,       setQuery]       = useState("");
  const [open,        setOpen]        = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef   = useRef(null);
  const listRef    = useRef(null);
  const wrapperRef = useRef(null);

  // Selected country object
  const selected = useMemo(
    () => COUNTRIES.find((c) => c.name === value) || null,
    [value]
  );

  // Filtered list
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [query]);

  // Reset highlight when filtered list changes
  useEffect(() => { setHighlighted(0); }, [filtered]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.querySelector(`[data-idx="${highlighted}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = useCallback(
    (country) => {
      onChange?.(country.name);
      setQuery("");
      setOpen(false);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (!open) {
        if (e.key === "Enter" || e.key === "ArrowDown") setOpen(true);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
      } else if (e.key === "Enter" && filtered[highlighted]) {
        e.preventDefault();
        handleSelect(filtered[highlighted]);
      } else if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    },
    [open, filtered, highlighted, handleSelect]
  );

  const displayValue = open ? query : (selected ? `${selected.flag} ${selected.name}` : "");

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
      {label && (
        <label style={{
          display:       "block",
          fontFamily:    "'DM Sans', sans-serif",
          fontSize:      12,
          fontWeight:    600,
          color:         "rgba(255,255,255,0.45)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom:  8,
        }}>
          {label}
        </label>
      )}

      {/* Trigger input */}
      <div
        style={{
          position:      "relative",
          display:       "flex",
          alignItems:    "center",
          background:    "rgba(255,255,255,0.05)",
          border:        open
                           ? "1px solid rgba(110,247,255,0.5)"
                           : "1px solid rgba(255,255,255,0.1)",
          borderRadius:  12,
          padding:       "0 16px",
          gap:           10,
          transition:    "border-color 0.2s, box-shadow 0.2s",
          boxShadow:     open ? "0 0 0 3px rgba(110,247,255,0.1)" : "none",
          cursor:        "text",
        }}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {/* Flag or search icon */}
        <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1, userSelect: "none" }}>
          {!open && selected ? selected.flag : "🔍"}
        </span>

        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          placeholder={!open && !selected ? placeholder : "Type to search…"}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          aria-autocomplete="list"
          aria-expanded={open}
          autoComplete="off"
          style={{
            flex:       1,
            background: "transparent",
            border:     "none",
            outline:    "none",
            color:      "#ffffff",
            fontSize:   15,
            fontFamily: "'DM Sans', sans-serif",
            padding:    "14px 0",
          }}
        />

        {/* Clear / chevron */}
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            if (selected) { onChange?.(""); setQuery(""); }
            else setOpen((o) => !o);
          }}
          style={{
            background: "none",
            border:     "none",
            padding:    4,
            cursor:     "pointer",
            color:      "rgba(255,255,255,0.3)",
            flexShrink: 0,
            display:    "flex",
            alignItems: "center",
            transition: "color 0.15s",
          }}
        >
          {selected ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          )}
        </button>
      </div>

      {/* Dropdown list */}
      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            initial={{ opacity: 0, y: -6, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0,  scaleY: 1 }}
            exit={{   opacity: 0, y: -6, scaleY: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{
              position:        "absolute",
              top:             "calc(100% + 6px)",
              left:            0,
              right:           0,
              zIndex:          100,
              maxHeight:       240,
              overflowY:       "auto",
              background:      "rgba(15,21,37,0.97)",
              border:          "1px solid rgba(255,255,255,0.1)",
              borderRadius:    12,
              padding:         "6px",
              listStyle:       "none",
              backdropFilter:  "blur(24px)",
              boxShadow:       "0 16px 48px rgba(0,0,0,0.55)",
              transformOrigin: "top",
              scrollbarWidth:  "thin",
              scrollbarColor:  "rgba(110,247,255,0.2) transparent",
            }}
            role="listbox"
          >
            {filtered.length === 0 ? (
              <li style={{
                padding:    "10px 12px",
                color:      "rgba(255,255,255,0.35)",
                fontSize:   13,
                fontFamily: "'DM Sans', sans-serif",
                textAlign:  "center",
              }}>
                No countries found
              </li>
            ) : (
              filtered.map((country, idx) => {
                const isActive = country.name === value;
                const isHover  = idx === highlighted;
                return (
                  <li
                    key={country.code}
                    data-idx={idx}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setHighlighted(idx)}
                    onClick={() => handleSelect(country)}
                    style={{
                      display:      "flex",
                      alignItems:   "center",
                      gap:          10,
                      padding:      "9px 12px",
                      borderRadius: 8,
                      cursor:       "pointer",
                      background:   isActive
                                      ? "rgba(110,247,255,0.12)"
                                      : isHover
                                        ? "rgba(255,255,255,0.05)"
                                        : "transparent",
                      color:        isActive ? "#6ef7ff" : "rgba(255,255,255,0.85)",
                      fontSize:     14,
                      fontFamily:   "'DM Sans', sans-serif",
                      transition:   "background 0.1s",
                      userSelect:   "none",
                    }}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>
                      {country.flag}
                    </span>
                    <span style={{ flex: 1 }}>{country.name}</span>
                    {isActive && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="#6ef7ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </li>
                );
              })
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
