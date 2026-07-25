import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpArticlePage } from "@/features/marketing/HelpArticlePage";
import { getHelpArticle, HELP_ARTICLES } from "@/features/marketing/help/helpCatalog";

/**
 * Help article route (HELP-CENTER-1).
 *
 * `/help/<slug>` is the STABLE article URL contract for future contextual
 * help links (see features/marketing/help/helpTypes.ts). Slugs come only
 * from the typed catalog; anything else 404s via the framework's normal
 * `notFound()` behavior. Public — no auth gate.
 */

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams(): Array<{ slug: string }> {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) return { title: "Help Center — ChainReact" };
  return {
    title: `${article.title} — ChainReact Help`,
    description: article.summary,
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) notFound();
  return <HelpArticlePage article={article} />;
}
