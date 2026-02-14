import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className="text-[16px] font-bold text-text-primary mt-4 mb-2">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[15px] font-bold text-text-primary mt-3 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[14px] font-semibold text-text-primary mt-3 mb-1">{children}</h3>
          ),
          // Paragraphs
          p: ({ children }) => <p className="text-[13px] text-text-secondary my-2 leading-relaxed">{children}</p>,
          // Lists
          ul: ({ children }) => <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-[13px] text-text-secondary">{children}</li>,
          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline"
            >
              {children}
            </a>
          ),
          // Code
          code: ({ className, children }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="rounded bg-surface-hover px-1.5 py-0.5 text-[12px] font-mono text-text-primary">
                  {children}
                </code>
              );
            }
            return (
              <code className="block rounded-lg bg-hero-from p-3 text-[12px] font-mono text-white overflow-x-auto my-2">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="my-2">{children}</pre>,
          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary pl-3 my-2 text-text-secondary italic">
              {children}
            </blockquote>
          ),
          // Strong/Bold
          strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
          // Emphasis/Italic
          em: ({ children }) => <em className="italic">{children}</em>,
          // Horizontal Rule
          hr: () => <hr className="my-4 border-edge" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
