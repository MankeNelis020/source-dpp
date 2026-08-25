import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, SITE_URL } from "@/lib/seo/site";

const privateDisallow = [...PRIVATE_PATHS];

export default function robots(): MetadataRoute.Robots {
  const publicRules = {
    allow: "/",
    disallow: privateDisallow,
  };

  return {
    rules: [
      { userAgent: "*", ...publicRules },
      { userAgent: "Googlebot", ...publicRules },
      { userAgent: "Bingbot", ...publicRules },
      { userAgent: "OAI-SearchBot", ...publicRules },
      { userAgent: "ChatGPT-User", ...publicRules },
      { userAgent: "PerplexityBot", ...publicRules },
      {
        userAgent: "GPTBot",
        ...publicRules,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
