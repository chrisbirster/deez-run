import type { JSX } from "@solidjs/web";
import * as stylex from "@stylexjs/stylex";
import { colors } from "./siteStyles";

export function Stack(props: {
  children?: JSX.Element;
  direction?: "row" | "column";
  gap?: number;
  align?: "start" | "center" | "stretch";
}) {
  return (
    <div
      {...stylex.props(
        primitives.stack,
        props.direction === "row" && primitives.row,
        props.align === "start" && primitives.alignStart,
        props.align === "center" && primitives.alignCenter,
        (!props.align || props.align === "stretch") && primitives.alignStretch,
      )}
      style={{ gap: `${props.gap ?? 16}px` }}
    >
      {props.children}
    </div>
  );
}

export function Text(props: {
  children?: JSX.Element;
  tone?: "default" | "muted" | "accent";
  weight?: "regular" | "medium" | "bold";
}) {
  return (
    <span
      {...stylex.props(
        primitives.text,
        props.tone === "muted" && primitives.muted,
        props.tone === "accent" && primitives.accent,
        props.weight === "medium" && primitives.medium,
        props.weight === "bold" && primitives.bold,
      )}
    >
      {props.children}
    </span>
  );
}

export function Button(props: {
  children?: JSX.Element;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={props.type ?? "button"}
      disabled={props.disabled}
      onClick={() => props.onClick?.()}
      {...stylex.props(primitives.button)}
    >
      {props.children}
    </button>
  );
}

export function Surface(props: { children?: JSX.Element }) {
  return <section {...stylex.props(primitives.surface)}>{props.children}</section>;
}

const primitives = stylex.create({
  stack: { display: "flex", flexDirection: "column" },
  row: { flexDirection: "row" },
  alignStart: { alignItems: "flex-start" },
  alignCenter: { alignItems: "center" },
  alignStretch: { alignItems: "stretch" },
  text: { color: colors.ink, lineHeight: 1.5 },
  muted: { color: colors.muted },
  accent: { color: colors.accent },
  medium: { fontWeight: 600 },
  bold: { fontWeight: 750 },
  button: {
    appearance: "none",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.accent,
    borderRadius: 12,
    backgroundColor: { default: colors.accent, ":hover": "#284f39" },
    color: colors.accentInk,
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    fontWeight: 750,
    minHeight: 46,
    paddingBlock: 12,
    paddingInline: 16,
    opacity: { default: 1, ":disabled": 0.55 },
  },
  surface: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.line,
    borderRadius: 18,
    backgroundColor: colors.paper,
    boxShadow: "0 16px 50px rgba(70, 61, 43, 0.06)",
    padding: 24,
  },
});
