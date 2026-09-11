const allowedTags = new Set([
  "B",
  "BR",
  "CODE",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "I",
  "LI",
  "OL",
  "P",
  "PRE",
  "SMALL",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "U",
  "UL",
]);

const droppedTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH"]);

function copySafeNode(node: Node, target: DocumentFragment | HTMLElement) {
  if (node.nodeType === Node.TEXT_NODE) {
    target.append(document.createTextNode(node.textContent ?? ""));
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  if (droppedTags.has(node.tagName)) return;

  if (!allowedTags.has(node.tagName)) {
    for (const child of Array.from(node.childNodes)) copySafeNode(child, target);
    return;
  }

  // Type-answer placement is represented by rendered.interaction. The marker
  // emitted by the Zig renderer is an implementation detail, not visible text.
  if (node.tagName === "SPAN" && node.classList.contains("deez-type-answer")) return;

  const safe = document.createElement(node.tagName.toLowerCase());
  if (node.tagName === "SPAN" && node.classList.contains("cloze")) safe.className = "cloze";
  for (const child of Array.from(node.childNodes)) copySafeNode(child, safe);
  target.append(safe);
}

/**
 * Convert Deez card HTML into a deliberately tiny presentation subset.
 *
 * No source attributes are copied, so href/src/style/event-handler injection
 * cannot cross this boundary. Unknown tags are unwrapped to their text/content;
 * active-content containers are dropped entirely.
 */
export function safeCardMarkup(markup: string) {
  const source = document.createElement("template");
  source.innerHTML = markup;
  const clean = document.createElement("div");
  for (const child of Array.from(source.content.childNodes)) copySafeNode(child, clean);
  return clean.innerHTML;
}
