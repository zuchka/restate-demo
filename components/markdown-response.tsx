import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownResponse({ children }: { children: string }) {
  return (
    <div className="answer-copy markdown-response">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children: linkChildren, href, title }) => (
            <a href={href} title={title} target="_blank" rel="noreferrer">
              {linkChildren}
            </a>
          ),
          img: ({ alt }) => (
            <span className="markdown-image-placeholder">Image: {alt || "attachment"}</span>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
