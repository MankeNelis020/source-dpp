import { SITE_NAME, SITE_URL, SOURCE_CATEGORY, SOURCE_DEFINITION } from "./site";

type JsonLd = Record<string, unknown>;

export function organizationNode(): JsonLd {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    legalName: "SOURCE",
    url: `${SITE_URL}/`,
    description: SOURCE_DEFINITION,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}/icon`,
    },
    address: {
      "@type": "PostalAddress",
      addressLocality: "Amsterdam",
      addressCountry: "NL",
    },
  };
}

export function websiteNode(): JsonLd {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: `${SITE_URL}/`,
    name: SITE_NAME,
    description: SOURCE_DEFINITION,
    inLanguage: "en",
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

export function softwareNode(): JsonLd {
  return {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: SOURCE_DEFINITION,
    featureList: [
      "Evidence gap detection",
      "Retrieval of existing evidence",
      "Scoped supplier requests",
      "Readiness gates",
      "Permissioned reuse",
      "Unresolved outcome recording",
    ],
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

export function breadcrumbList(items: { name: string; path: string }[]): JsonLd {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.path.startsWith("http") ? item.path : `${SITE_URL}${item.path === "/" ? "/" : item.path}`,
    })),
  };
}

export function articleNode(opts: {
  path: string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
}): JsonLd {
  return {
    "@type": "Article",
    headline: opts.headline,
    description: opts.description,
    inLanguage: "en-GB",
    datePublished: opts.datePublished,
    dateModified: opts.dateModified,
    author: { "@id": `${SITE_URL}/authors/source-research#person` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    mainEntityOfPage: `${SITE_URL}${opts.path}`,
  };
}

export function faqPageNode(questions: { q: string; a: string }[]): JsonLd {
  return {
    "@type": "FAQPage",
    mainEntity: questions.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}

export function definedTermNode(opts: {
  name: string;
  description: string;
  url: string;
}): JsonLd {
  return {
    "@type": "DefinedTerm",
    name: opts.name,
    description: opts.description,
    url: opts.url,
    inDefinedTermSet: `${SITE_URL}/resources/glossary`,
  };
}

export function personResearchNode(): JsonLd {
  return {
    "@type": "Person",
    "@id": `${SITE_URL}/authors/source-research#person`,
    name: "SOURCE Research",
    url: `${SITE_URL}/authors/source-research`,
    worksFor: { "@id": `${SITE_URL}/#organization` },
    knowsAbout: ["Digital Product Passport", "ESPR", SOURCE_CATEGORY],
  };
}

export function graph(nodes: JsonLd[]) {
  return {
    "@context": "https://schema.org",
    "@graph": [organizationNode(), websiteNode(), ...nodes],
  };
}
