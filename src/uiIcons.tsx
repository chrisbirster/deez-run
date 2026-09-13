export type UiIconName =
  | "layers"
  | "search"
  | "book"
  | "rocket"
  | "card"
  | "offline"
  | "tools"
  | "home"
  | "settings"
  | "globe"
  | "terminal"
  | "cloud"
  | "bolt"
  | "bars"
  | "calendar"
  | "chevron";

export function UiIcon(props: { name: UiIconName; size?: number; class?: string }) {
  const size = () => props.size ?? 24;
  const common = {
    width: size(),
    height: size(),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.9,
    "stroke-linecap": "round" as const,
    "stroke-linejoin": "round" as const,
    "aria-hidden": true,
    class: props.class,
  };

  switch (props.name) {
    case "layers":
      return <svg {...common}><path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4"/><path d="m4 17 8 4 8-4"/></svg>;
    case "search":
      return <svg {...common}><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.2 4.2"/></svg>;
    case "book":
      return <svg {...common}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>;
    case "rocket":
      return <svg {...common}><path d="M14.5 5.5c2.2-2.2 4.3-2.5 5.5-2.5 0 1.2-.3 3.3-2.5 5.5l-5.7 5.7-4-4 6.7-4.7Z"/><path d="m8 10-4.2.8L3 14l5-1M12 14l-1 5 3.2-.8L15 14"/><path d="M6.5 17.5 4 20"/><circle cx="16" cy="7" r="1"/></svg>;
    case "card":
      return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h6M8 16h4"/></svg>;
    case "offline":
      return <svg {...common}><path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 8.3 4.5 4.5 0 0 0 7 18Z"/><path d="m9 13 3 3 3-3M12 10v6"/></svg>;
    case "tools":
      return <svg {...common}><path d="m14.5 5.5 4-4 2 2-4 4M13 7l4 4M6.2 4.2 9 7 7 9 4.2 6.2a4 4 0 0 1 2-2ZM10 14l-6.5 6.5M13 17l4-4 3.5 3.5-4 4L13 17Z"/></svg>;
    case "home":
      return <svg {...common}><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></svg>;
    case "settings":
      return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a7 7 0 0 0-1.8-1L14.2 3h-4.4l-.4 3a7 7 0 0 0-1.8 1L5.1 6 3 9.4 5 11a7 7 0 0 0 0 2l-2 1.6L5.1 18l2.5-1a7 7 0 0 0 1.8 1l.4 3h4.4l.4-3a7 7 0 0 0 1.8-1l2.5 1 2-3.4L19 13a7 7 0 0 0 .1-1Z"/></svg>;
    case "globe":
      return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>;
    case "terminal":
      return <svg {...common}><path d="m5 7 5 5-5 5M12 17h7"/></svg>;
    case "cloud":
      return <svg {...common}><path d="M6.5 18h11a4 4 0 0 0 .6-7.95A6.5 6.5 0 0 0 5.7 8.2 4.8 4.8 0 0 0 6.5 18Z"/></svg>;
    case "bolt":
      return <svg {...common}><path d="m13 2-8 12h6l-1 8 9-13h-6V2Z"/></svg>;
    case "bars":
      return <svg {...common}><path d="M5 20v-7h3v7H5ZM11 20V8h3v12h-3ZM17 20V4h3v16h-3Z"/></svg>;
    case "calendar":
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>;
    case "chevron":
      return <svg {...common}><path d="m9 5 7 7-7 7"/></svg>;
  }
}
