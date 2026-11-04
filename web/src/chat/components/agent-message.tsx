import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isGeneratedImageUrl } from "@veykor/shared";
import type { ChatHistoryItem } from "@veykor/shared";

interface Props {
  item: ChatHistoryItem;
}

const markdownComponents: Components = {
  p({ children }) {
    return (
      <p className="text-sm font-light text-zinc-200 leading-relaxed">
        {children}
      </p>
    );
  },

  a({ children, href }) {
    return (
      <a className="text-sky-400 underline" href={href}>
        {children}
      </a>
    );
  },

  img({ src }) {
    if (typeof src === "string" && isGeneratedImageUrl(src)) {
      return null;
    }

    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className="max-h-[480px] w-full rounded-xl border border-zinc-800 object-contain"
      />
    );
  },

  code({ children, className }) {
    return (
      <code
        className={`rounded bg-zinc-800 px-1 py-0.5 text-[13px] text-zinc-100 ${className ?? ""}`}
      >
        {children}
      </code>
    );
  },

  pre({ children }) {
    return (
      <pre className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 overflow-x-auto text-[13px] text-zinc-200 [&_code]:rounded-none [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    );
  },

  ul({ children }) {
    return (
      <ul className="ml-5 list-disc space-y-1 text-sm font-light text-zinc-200">
        {children}
      </ul>
    );
  },

  ol({ children }) {
    return (
      <ol className="ml-5 list-decimal space-y-1 text-sm font-light text-zinc-200">
        {children}
      </ol>
    );
  },

  h1({ children }) {
    return <h1 className="text-xl font-semibold text-zinc-100">{children}</h1>;
  },

  h2({ children }) {
    return <h2 className="text-lg font-semibold text-zinc-100">{children}</h2>;
  },

  h3({ children }) {
    return (
      <h3 className="text-base font-semibold text-zinc-100">{children}</h3>
    );
  },

  h4({ children }) {
    return <h4 className="text-sm font-semibold text-zinc-100">{children}</h4>;
  },

  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-zinc-700 pl-3 italic text-zinc-400">
        {children}
      </blockquote>
    );
  },

  table({ children }) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm font-light text-zinc-200">
          {children}
        </table>
      </div>
    );
  },

  th({ children }) {
    return (
      <th className="border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-left font-semibold text-zinc-100">
        {children}
      </th>
    );
  },

  td({ children }) {
    return (
      <td className="border border-zinc-800 px-3 py-1.5 text-zinc-200">
        {children}
      </td>
    );
  },
};

function AgentMessage(props: Props) {
  return (
    <div className="w-full min-w-0 space-y-3">
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={[remarkGfm]}
      >
        {props.item.text}
      </ReactMarkdown>
    </div>
  );
}

export default AgentMessage;
