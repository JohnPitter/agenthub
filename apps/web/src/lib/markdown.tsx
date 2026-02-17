import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router-dom";

interface MarkdownContentProps {
  content: string;
  projects?: Array<{ id: string; name: string }>;
}

function preprocessMentions(
  content: string,
  projects: Array<{ id: string; name: string }>
): string {
  return content.replace(/@\[([^\]]+)\]/g, (match, name) => {
    const project = projects.find(
      (p) => p.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (project) {
      return `[@${project.name}](/project/${project.id})`;
    }
    return match;
  });
}

export function MarkdownContent({ content, projects }: MarkdownContentProps) {
  const processed = projects ? preprocessMentions(content, projects) : content;

  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className="text-[16px] font-semibold text-neutral-fg1 mt-4 mb-2">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[15px] font-semibold text-neutral-fg1 mt-3 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[14px] font-semibold text-neutral-fg1 mt-3 mb-1">{children}</h3>
          ),
          // Paragraphs
          p: ({ children }) => <p className="text-[13px] text-neutral-fg2 my-2 leading-relaxed">{children}</p>,
          // Lists
          ul: ({ children }) => <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-[13px] text-neutral-fg2">{children}</li>,
          // Links — with project mention badge support
          a: ({ href, children }) => {
            if (href?.startsWith("/project/")) {
              return (
                <Link
                  to={href}
                  className="inline-flex items-center gap-1 rounded-md bg-brand-light px-1.5 py-0.5 text-[12px] font-semibold text-brand hover:bg-brand/20 no-underline"
                >
                  {children}
                </Link>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:text-brand-hover underline"
              >
                {children}
              </a>
            );
          },
          // Code
          code: ({ className, children }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="rounded bg-neutral-bg-hover px-1.5 py-0.5 text-[12px] font-mono text-neutral-fg1">
                  {children}
                </code>
              );
            }
            return (
              <code className="block rounded-md bg-[var(--code-block-bg)] p-3 text-[12px] font-mono text-white overflow-x-auto my-2">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="my-2">{children}</pre>,
          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-brand pl-3 my-2 text-neutral-fg2 italic">
              {children}
            </blockquote>
          ),
          // Strong/Bold
          strong: ({ children }) => <strong className="font-semibold text-neutral-fg1">{children}</strong>,
          // Emphasis/Italic
          em: ({ children }) => <em className="italic">{children}</em>,
          // Horizontal Rule
          hr: () => <hr className="my-4 border-stroke" />,
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
