"use client";

/* Rendu markdown maison, volontairement simple : titres, gras, italique,
   listes (puces / numérotées), citations, code, séparateurs, liens et
   numéros de téléphone cliquables. Aucun HTML brut n'est interprété. */

import { Fragment, type ReactNode } from "react";

type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "ul"; items: { text: string; depth: number }[] }
  | { t: "ol"; items: { text: string; depth: number; n: number }[] }
  | { t: "quote"; text: string }
  | { t: "code"; text: string }
  | { t: "hr" };

function parse(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^```/.test(line.trim())) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) buf.push(lines[i++]);
      i++;
      out.push({ t: "code", text: buf.join("\n") });
      continue;
    }
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (h) {
      out.push({ t: "h", level: h[1].length, text: h[2].replace(/#+\s*$/, "") });
      i++;
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push({ t: "hr" });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push({ t: "quote", text: buf.join("\n") });
      continue;
    }
    if (/^\s*[-*•+]\s+/.test(line)) {
      const items: { text: string; depth: number }[] = [];
      while (i < lines.length && (/^\s*[-*•+]\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const m = lines[i].match(/^(\s*)[-*•+]\s+(.*)$/);
        if (m) items.push({ text: m[2], depth: Math.min(2, Math.floor(m[1].replace(/\t/g, "  ").length / 2)) });
        else items[items.length - 1].text += " " + lines[i].trim();
        i++;
      }
      out.push({ t: "ul", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: { text: string; depth: number; n: number }[] = [];
      while (i < lines.length && (/^\s*\d+[.)]\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const m = lines[i].match(/^(\s*)(\d+)[.)]\s+(.*)$/);
        if (m) items.push({ text: m[3], depth: Math.min(2, Math.floor(m[1].length / 2)), n: Number(m[2]) });
        else {
          const sub = lines[i].match(/^\s+[-*•+]\s+(.*)$/);
          items[items.length - 1].text += sub ? "\n• " + sub[1] : " " + lines[i].trim();
        }
        i++;
      }
      out.push({ t: "ol", items });
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s{0,3}#{1,6}\s/.test(lines[i]) &&
      !/^\s*[-*•+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^```/.test(lines[i].trim())
    )
      buf.push(lines[i++]);
    out.push({ t: "p", text: buf.join("\n") });
  }
  return out;
}

const INLINE = /(\*\*[^*\n]+?\*\*|`[^`\n]+`|\[[^\]\n]+\]\((?:https?:|mailto:|tel:)[^)\s]+\)|https?:\/\/[^\s)]+|\*[^*\s\n][^*\n]*?\*|(?:\+33\s?|0)[1-9](?:[\s.]?\d{2}){4}|\[À compléter[^\]]*\])/g;

export function inline(text: string): ReactNode[] {
  const parts = text.split(INLINE);
  return parts.map((p, i) => {
    if (i % 2 === 0) return p.split("\n").map((s, j, arr) => (
      <Fragment key={`${i}-${j}`}>
        {s}
        {j < arr.length - 1 && <br />}
      </Fragment>
    ));
    if (p.startsWith("**")) return <strong key={i} className="font-semibold">{inline(p.slice(2, -2))}</strong>;
    if (p.startsWith("`")) return <code key={i} className="rounded bg-surface-2 px-1 py-0.5 text-[0.9em]">{p.slice(1, -1)}</code>;
    if (p.startsWith("[À compléter")) return <mark key={i} className="rounded bg-warn/15 px-1 text-warn">{p}</mark>;
    if (p.startsWith("[")) {
      const m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m) return <a key={i} href={m[2]} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">{m[1]}</a>;
    }
    if (p.startsWith("http")) return <a key={i} href={p} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2 break-all">{p}</a>;
    if (p.startsWith("*")) return <em key={i}>{inline(p.slice(1, -1))}</em>;
    if (/^(\+33|0)/.test(p)) return <a key={i} href={"tel:" + p.replace(/[\s.]/g, "")} className="text-accent underline underline-offset-2 whitespace-nowrap">{p}</a>;
    return p;
  });
}

export function Markdown({ text }: { text: string }) {
  const blocks = parse(text);
  return (
    <div className="space-y-2.5 text-[14.5px] leading-relaxed break-words">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h":
            return b.level <= 2 ? (
              <h3 key={i} className="font-serif text-[17px] font-semibold pt-1">{inline(b.text)}</h3>
            ) : (
              <h4 key={i} className="text-[13px] font-semibold uppercase tracking-wide text-accent pt-1">{inline(b.text)}</h4>
            );
          case "p":
            return <p key={i}>{inline(b.text)}</p>;
          case "ul":
            return (
              <ul key={i} className="space-y-1">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2" style={{ paddingLeft: it.depth * 16 }}>
                    <span className={it.depth ? "mt-[9px] size-1 shrink-0 rounded-full bg-muted" : "mt-[8px] size-1.5 shrink-0 rounded-full bg-coral"} />
                    <span className="min-w-0">{inline(it.text)}</span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="space-y-1.5">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2.5" style={{ paddingLeft: it.depth * 16 }}>
                    <span className="mt-0.5 grid place-items-center size-5 shrink-0 rounded-full bg-accent/10 text-[11px] font-semibold text-accent tabular-nums">{it.n}</span>
                    <span className="min-w-0">{inline(it.text)}</span>
                  </li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={i} className="border-l-2 border-coral/60 pl-3 text-fg/80 italic">
                {inline(b.text)}
              </blockquote>
            );
          case "code":
            return (
              <pre key={i} className="overflow-x-auto rounded-xl bg-surface-2 p-3 text-[12.5px] leading-snug whitespace-pre-wrap">
                {b.text}
              </pre>
            );
          case "hr":
            return <hr key={i} className="border-line" />;
        }
      })}
    </div>
  );
}
