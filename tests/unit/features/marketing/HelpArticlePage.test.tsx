/**
 * Help article page (HELP-CENTER-1).
 *
 * Protects the article reading experience: breadcrumbs back to the Help
 * Center, category label, one <h1>, typed content blocks (steps as a real
 * ordered list, note callouts), related-article links, and a way back.
 * Also pins honesty: NO "Was this helpful?" feedback controls exist in
 * this batch (there is no backend to receive them).
 */
import { render, screen, within } from "@testing-library/react";
import { HelpArticlePage } from "@/features/marketing/HelpArticlePage";
import { getHelpArticle } from "@/features/marketing/help/helpCatalog";

function articleOrThrow(slug: string) {
  const article = getHelpArticle(slug);
  if (!article) throw new Error(`test article missing from catalog: ${slug}`);
  return article;
}

describe("HelpArticlePage", () => {
  it("renders breadcrumbs, category label, one <h1> title, and the summary lede", () => {
    render(<HelpArticlePage article={articleOrThrow("troubleshoot-a-failed-run")} />);
    const crumbs = screen.getByTestId("help-article-breadcrumbs");
    expect(within(crumbs).getByRole("link", { name: "Help Center" })).toHaveAttribute(
      "href",
      "/help",
    );
    expect(crumbs).toHaveTextContent("Troubleshooting");
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Troubleshoot a failed workflow run");
    expect(
      screen.getByText(/read the plain-language explanation/i),
    ).toBeInTheDocument();
  });

  it("renders step blocks as a real ordered list and note blocks as callouts", () => {
    const { container } = render(
      <HelpArticlePage article={articleOrThrow("connect-fleetio")} />,
    );
    // Ordered list with the manifest-sourced Fleetio steps.
    const ol = container.querySelector("ol.ha-steps");
    expect(ol).not.toBeNull();
    expect(ol?.textContent).toMatch(/Manage API Keys/);
    // Note callout renders with role=note.
    expect(screen.getAllByRole("note").length).toBeGreaterThan(0);
  });

  it("renders related articles as working links", () => {
    render(<HelpArticlePage article={articleOrThrow("connect-an-app")} />);
    const related = screen.getByTestId("help-article-related");
    expect(
      within(related).getByRole("link", { name: /create your first workflow/i }),
    ).toHaveAttribute("href", "/help/create-your-first-workflow");
  });

  it("offers a way back to the Help Center and a real compact support mailto", () => {
    render(<HelpArticlePage article={articleOrThrow("understand-task-usage")} />);
    expect(screen.getByTestId("help-article-back")).toHaveAttribute("href", "/help");
    const support = screen.getByTestId("help-support-callout");
    expect(within(support).getByRole("link", { name: /email support/i })).toHaveAttribute(
      "href",
      "mailto:support@chainreact.app",
    );
  });

  it("ships no feedback controls (no dead 'Was this helpful?' UI)", () => {
    render(<HelpArticlePage article={articleOrThrow("connect-an-app")} />);
    expect(screen.queryByText(/was this helpful/i)).not.toBeInTheDocument();
  });
});
