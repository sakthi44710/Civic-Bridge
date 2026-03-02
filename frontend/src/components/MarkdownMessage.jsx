import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * ChatGPT-style markdown message renderer.
 * Supports numbered lists, bold, italic, code, tables, links, etc.
 */
export default function MarkdownMessage({ content, role }) {
  const isUser = role === 'user';

  // For user messages, render as plain text
  if (isUser) {
    return <p className="whitespace-pre-wrap">{content}</p>;
  }

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Paragraphs
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
          ),

          // Strong / Bold
          strong: ({ children }) => (
            <strong className="font-semibold text-white/90">{children}</strong>
          ),

          // Emphasis / Italic
          em: ({ children }) => (
            <em className="italic text-white/70">{children}</em>
          ),

          // Ordered list (numbered)
          ol: ({ children }) => (
            <ol className="list-decimal list-outside ml-5 mb-3 space-y-1.5">{children}</ol>
          ),

          // Unordered list (bullets)
          ul: ({ children }) => (
            <ul className="list-disc list-outside ml-5 mb-3 space-y-1.5">{children}</ul>
          ),

          // List items
          li: ({ children, ordered, index }) => (
            <li className="text-white/60 leading-relaxed pl-1">
              {children}
            </li>
          ),

          // Headings
          h1: ({ children }) => (
            <h1 className="text-lg font-bold text-white/90 mb-2 mt-3 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold text-white/85 mb-2 mt-3 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-white/80 mb-1.5 mt-2 first:mt-0">{children}</h3>
          ),

          // Inline code
          code: ({ inline, className, children }) => {
            if (inline) {
              return (
                <code className="bg-white/[0.06] text-[#00d4ff]/80 px-1.5 py-0.5 rounded text-[12px] font-mono">
                  {children}
                </code>
              );
            }
            return (
              <pre className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-3 mb-2 overflow-x-auto">
                <code className="text-[12px] font-mono text-white/70 leading-relaxed">{children}</code>
              </pre>
            );
          },

          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#00d4ff]/30 pl-3 my-2 text-white/50 italic">
              {children}
            </blockquote>
          ),

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00d4ff] hover:text-[#00d4ff]/80 underline underline-offset-2 transition-colors"
            >
              {children}
            </a>
          ),

          // Horizontal rule
          hr: () => (
            <hr className="border-white/[0.06] my-3" />
          ),

          // Table
          table: ({ children }) => (
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-[12px] border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-white/[0.08]">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="text-left py-1.5 px-2 text-white/70 font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="py-1.5 px-2 text-white/50 border-b border-white/[0.04]">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
