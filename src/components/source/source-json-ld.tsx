import { JsonLd } from "./json-ld";
import { catalogByPath } from "@/lib/seo/catalog";
import { breadcrumbList, faqPageNode, graph, softwareNode } from "@/lib/seo/jsonld";
import { PUBLIC_FAQS } from "@/lib/source/copy";

export function SourceJsonLd({
  path,
  includeFaq = false,
}: {
  path: string;
  includeWebsite?: boolean;
  includeFaq?: boolean;
}) {
  const page = catalogByPath(path);
  const nodes = [softwareNode()];
  if (path !== "/") {
    nodes.push(
      breadcrumbList([
        { name: "Home", path: "/" },
        { name: page?.title ?? path, path },
      ])
    );
  }
  if (includeFaq) {
    nodes.push(faqPageNode(PUBLIC_FAQS.map((item) => ({ q: item.q, a: item.a }))));
  }
  return <JsonLd data={graph(nodes)} />;
}
