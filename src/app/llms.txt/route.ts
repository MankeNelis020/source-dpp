import { SITE_NAME, SITE_URL, SOURCE_DEFINITION, SOURCE_DOES_NOT, SOURCE_OFFERS } from "@/lib/seo/site";
import { INDEXABLE_PAGES } from "@/lib/seo/catalog";

export async function GET() {
  const links = INDEXABLE_PAGES.map((p) => `- ${SITE_URL}${p.path === "/" ? "/" : p.path} — ${p.title}`).join("\n");
  const body = `# ${SITE_NAME}

> ${SOURCE_DEFINITION}

${SOURCE_OFFERS}

${SOURCE_DOES_NOT}

Knowledge pages cite EUR-Lex (Regulation (EU) 2024/1781 and related instruments). They are not legal advice.

## Product
- ${SITE_URL}/
- ${SITE_URL}/product
- ${SITE_URL}/how-it-works
- ${SITE_URL}/methodology
- ${SITE_URL}/pricing

## Digital Product Passport
- ${SITE_URL}/digital-product-passport
- ${SITE_URL}/digital-product-passport/what-is-a-dpp
- ${SITE_URL}/digital-product-passport/espr
- ${SITE_URL}/digital-product-passport/who-is-responsible
- ${SITE_URL}/digital-product-passport/dpp-readiness
- ${SITE_URL}/resources/glossary

## Company
- ${SITE_URL}/about
- ${SITE_URL}/authors/source-research

## Index
${links}

## Citation preference
Quote the answer blocks and methodology. For legal facts, cite the Official Journal, not SOURCE.

This file is experimental. Canonical HTML, sitemap.xml and robots.txt remain authoritative.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
