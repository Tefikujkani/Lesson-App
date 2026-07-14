import React from "react";

interface MarkdownViewProps {
  content: string;
  textSize?: "sm" | "base" | "lg";
}

export function MarkdownView({ content, textSize = "base" }: MarkdownViewProps) {
  if (!content) return null;

  // Map sizes to typography classes
  const sizeClasses = {
    sm: {
      p: "text-[13px] leading-relaxed mb-3",
      li: "text-[12px] leading-normal mb-1",
      h1: "text-xl font-bold mt-6 mb-3",
      h2: "text-lg font-bold mt-5 mb-2.5",
      h3: "text-base font-bold mt-4 mb-2",
      h4: "text-xs font-semibold uppercase tracking-wider mt-3 mb-1",
      quote: "text-[12px] p-2.5 my-3",
    },
    base: {
      p: "font-serif text-[15px] leading-relaxed text-[#0c1a1f] mb-4",
      li: "text-sm text-[#2a3d44] leading-relaxed mb-1.5",
      h1: "font-display text-2xl font-extrabold text-[#0c1a1f] mt-10 mb-5 tracking-tight border-b-2 border-[#0d8f7c] pb-2",
      h2: "font-display text-xl font-bold text-[#0c1a1f] mt-8 mb-4 tracking-tight border-b border-[#c5d5da] pb-2",
      h3: "font-display text-lg font-bold text-[#0c1a1f] mt-6 mb-3 tracking-tight border-b border-[#c5d5da] pb-1",
      h4: "text-xs font-bold uppercase tracking-[0.15em] text-[#5a737a] mt-5 mb-2",
      quote: "border-l-4 border-[#0d8f7c] pl-4 py-2 my-4 text-[#2a3d44] bg-[#f4f8f9] border border-[#c5d5da] rounded-r p-3 text-[13px]",
    },
    lg: {
      p: "font-serif text-[17px] leading-loose text-[#0c1a1f] mb-5",
      li: "text-base text-[#0c1a1f] leading-loose mb-2",
      h1: "font-display text-3xl font-extrabold text-[#0c1a1f] mt-12 mb-6 tracking-tight border-b-2 border-[#0d8f7c] pb-3",
      h2: "font-display text-2xl font-bold text-[#0c1a1f] mt-10 mb-5 tracking-tight border-b border-[#c5d5da] pb-2.5",
      h3: "font-display text-xl font-bold text-[#0c1a1f] mt-8 mb-4 tracking-tight border-b border-[#c5d5da] pb-1.5",
      h4: "text-sm font-bold uppercase tracking-[0.15em] text-[#5a737a] mt-6 mb-2.5",
      quote: "border-l-4 border-[#0d8f7c] pl-5 py-3 my-5 text-[#2a3d44] bg-[#f4f8f9] border border-[#c5d5da] rounded-r p-4 text-[15px]",
    },
  }[textSize];

  // Split content by lines to process them structurally
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let listKey = 0;

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`ul-${listKey++}`} className={`list-disc pl-6 mb-4 space-y-2 text-[#2a3d44] leading-relaxed`}>
          {...currentList}
        </ul>
      );
      currentList = [];
    }
  };

  const parseInlineStyles = (text: string): React.ReactNode[] => {
    // Basic inline parser for bold (**text**), italics (*text*), and inline code (`code`)
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      const boldIdx = remaining.indexOf("**");
      const codeIdx = remaining.indexOf("`");

      if (boldIdx === -1 && codeIdx === -1) {
        parts.push(<span key={key++}>{remaining}</span>);
        break;
      }

      // Check which one occurs first
      if (boldIdx !== -1 && (codeIdx === -1 || boldIdx < codeIdx)) {
        // Handle bold
        if (boldIdx > 0) {
          parts.push(<span key={key++}>{remaining.slice(0, boldIdx)}</span>);
        }
        const nextBoldIdx = remaining.indexOf("**", boldIdx + 2);
        if (nextBoldIdx !== -1) {
          parts.push(
            <strong key={key++} className="font-semibold text-black bg-[#e7f0f2] px-1 rounded">
              {remaining.slice(boldIdx + 2, nextBoldIdx)}
            </strong>
          );
          remaining = remaining.slice(nextBoldIdx + 2);
        } else {
          parts.push(<span key={key++}>**</span>);
          remaining = remaining.slice(boldIdx + 2);
        }
      } else {
        // Handle inline code
        if (codeIdx > 0) {
          parts.push(<span key={key++}>{remaining.slice(0, codeIdx)}</span>);
        }
        const nextCodeIdx = remaining.indexOf("`", codeIdx + 1);
        if (nextCodeIdx !== -1) {
          parts.push(
            <code key={key++} className="font-mono text-xs text-amber-850 bg-[#f4f8f9] px-1.5 py-0.5 rounded border border-[#c5d5da]">
              {remaining.slice(codeIdx + 1, nextCodeIdx)}
            </code>
          );
          remaining = remaining.slice(nextCodeIdx + 1);
        } else {
          parts.push(<span key={key++}>`</span>);
          remaining = remaining.slice(codeIdx + 1);
        }
      }
    }

    return parts;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle Code Blocks
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        // End code block
        inCodeBlock = false;
        elements.push(
          <pre key={`code-${i}`} className="bg-[#0c1a1f] text-[#f4f8f9] font-mono text-xs p-4 rounded overflow-x-auto my-4 border border-[#c5d5da]">
            <code>{codeBlockContent.join("\n")}</code>
          </pre>
        );
        codeBlockContent = [];
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Handle Headings
    if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={`h3-${i}`} className={sizeClasses.h3}>
          {parseInlineStyles(line.slice(4))}
        </h3>
      );
      continue;
    }

    if (line.startsWith("#### ")) {
      flushList();
      elements.push(
        <h4 key={`h4-${i}`} className={sizeClasses.h4}>
          {parseInlineStyles(line.slice(5))}
        </h4>
      );
      continue;
    }

    if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h2 key={`h2-${i}`} className={sizeClasses.h2}>
          {parseInlineStyles(line.slice(3))}
        </h2>
      );
      continue;
    }

    if (line.startsWith("# ")) {
      flushList();
      elements.push(
        <h1 key={`h1-${i}`} className={sizeClasses.h1}>
          {parseInlineStyles(line.slice(2))}
        </h1>
      );
      continue;
    }

    // Handle Bullet Lists
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)/);
    if (listMatch) {
      const listContent = listMatch[3];
      currentList.push(
        <li key={`li-${i}`} className={sizeClasses.li}>
          {parseInlineStyles(listContent)}
        </li>
      );
      continue;
    }

    // If it's a non-empty line and list is running, keep building the list OR flush it
    if (line.trim() === "") {
      flushList();
      continue;
    }

    // Blockquotes or citations (often found in academic text)
    if (line.trim().startsWith(">")) {
      flushList();
      elements.push(
        <blockquote key={`quote-${i}`} className={sizeClasses.quote}>
          {parseInlineStyles(line.trim().slice(1).trim())}
        </blockquote>
      );
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} className={sizeClasses.p}>
        {parseInlineStyles(line)}
      </p>
    );
  }

  // Flush any final list
  flushList();

  return <div className="markdown-body space-y-1">{elements}</div>;
}
