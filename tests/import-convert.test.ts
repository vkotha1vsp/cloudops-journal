import { describe, expect, it } from "vitest";
import { detect, markdownToHtml, sanitize, sourceTypeOf, textToHtml, titleFrom } from "@/domain/import/convert";
import { LAB_TEMPLATES } from "@/domain/labs/templates";
import { ROADMAPS } from "@/domain/roadmaps";
import { CONCEPTS } from "@/domain/architecture/library";

const CHATGPT = `# Route 53 and ALB

Route 53 resolves **app.example.com** to the Application Load Balancer.

| Component | Role |
|---|---|
| ALB | Layer 7 |

\`\`\`bash
aws elbv2 describe-target-health --target-group-arn $TG
\`\`\`

\`\`\`mermaid
flowchart LR
  U[User] --> R53[Route 53]
\`\`\`

- [x] Created target group
- [ ] Added HTTPS listener

<script>alert(1)</script>
<img src=x onerror=alert(1)>

[bad](javascript:alert(1)) [good](https://docs.aws.amazon.com/)
`;

describe("ChatGPT Markdown import", () => {
  const html = markdownToHtml(CHATGPT);

  it("keeps headings, tables, code languages and Mermaid", () => {
    expect(html).toContain("<h1>Route 53 and ALB</h1>");
    expect(html).toContain("<table>");
    expect(html).toContain('class="language-bash"');
    expect(html).toContain('class="language-mermaid"');
  });

  it("converts GFM task lists to editor task items", () => {
    expect(html).toContain('<ul data-type="taskList">');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
  });

  it("removes scripts, event handlers, images and javascript: links", () => {
    expect(html).not.toMatch(/<script|onerror|<img|javascript:/i);
    expect(html).toContain('href="https://docs.aws.amazon.com/"');
  });

  it("detects services, proposes a Studio prompt and a title", () => {
    const d = detect(html);
    expect(d.services.map((s) => s.kind)).toEqual(expect.arrayContaining(["route53", "alb"]));
    expect(d.mermaidBlocks).toBe(1);
    expect(d.architecturePrompt).toMatch(/^Create an AWS architecture using/);
    expect(titleFrom(html, "x.md")).toBe("Route 53 and ALB");
    expect(titleFrom("<p>no heading</p>", "my-notes_file.md")).toBe("my notes file");
  });

  it("maps file extensions and detects bare Mermaid in plain text", () => {
    expect(sourceTypeOf("a.MD")).toBe("md");
    expect(sourceTypeOf("x.docx")).toBe("docx");
    expect(sourceTypeOf("x.exe")).toBeNull();
    expect(textToHtml("graph TD\n A-->B\n\nplain <b>text</b>")).toBe('<pre><code class="language-mermaid">graph TD\n A--&gt;B</code></pre>\n<p>plain &lt;b&gt;text&lt;/b&gt;</p>');
  });

  it("sanitize keeps only editor-safe structure", () => {
    expect(sanitize('<div style="x"><h6>t</h6><iframe src="//x"></iframe><a href="https://a.b" onclick="x">l</a></div>')).toBe('<h3>t</h3><a href="https://a.b">l</a>');
  });
});

describe("content catalogues", () => {
  it("has the ten starter labs from the spec with steps, checks and cleanup", () => {
    expect(LAB_TEMPLATES).toHaveLength(10);
    expect(new Set(LAB_TEMPLATES.map((t) => t.id)).size).toBe(10);
    for (const t of LAB_TEMPLATES) {
      expect(t.steps.length).toBeGreaterThan(2);
      expect(t.checklist.length).toBeGreaterThan(1);
      expect(t.cleanup.length).toBeGreaterThan(10);
      if (t.conceptId) expect(CONCEPTS.some((c) => c.id === t.conceptId)).toBe(true);
    }
  });

  it("roadmaps only reference existing labs and concepts", () => {
    for (const r of ROADMAPS)
      for (const item of r.stages.flatMap((s) => s.items)) {
        if (item.lab) expect(LAB_TEMPLATES.some((l) => l.id === item.lab), item.lab).toBe(true);
        if (item.concept) expect(CONCEPTS.some((c) => c.id === item.concept), item.concept).toBe(true);
      }
  });
});
