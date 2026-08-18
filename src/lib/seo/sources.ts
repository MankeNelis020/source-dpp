export const PRIMARY_SOURCES = {
  espr: {
    id: "espr-2024-1781",
    label: "Regulation (EU) 2024/1781 (ESPR)",
    href: "https://eur-lex.europa.eu/eli/reg/2024/1781/oj",
    publisher: "Official Journal of the European Union",
    published: "2024-06-28",
    note: "Framework regulation. Applied since 18 July 2024. Product-specific DPP obligations are not listed as a single universal deadline in this act.",
  },
  esprSummary: {
    id: "espr-summary",
    label: "EUR-Lex summary: Ecodesign requirements for sustainable products",
    href: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=legissum:4761760",
    publisher: "EUR-Lex",
    published: "2024",
    note: "Commission-facing summary of ESPR, including the Digital Product Passport concept.",
  },
  batteries: {
    id: "batteries-2023-1542",
    label: "Regulation (EU) 2023/1542 (Batteries)",
    href: "https://eur-lex.europa.eu/eli/reg/2023/1542/oj",
    publisher: "Official Journal of the European Union",
    published: "2023-07-28",
    note: "Battery passport obligations sit in this regulation, not only in ESPR.",
  },
} as const;

export type SourceId = keyof typeof PRIMARY_SOURCES;
