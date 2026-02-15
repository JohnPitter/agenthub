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
          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:text-brand-hover underline"
            >
              {children}
            </a>
          ),
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
              <code className="block rounded-md bg-neutral-fg1 p-3 text-[12px] font-mono text-white overflow-x-auto my-2">
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
        {content}
      </ReactMarkdown>
    </div>
  );
}
