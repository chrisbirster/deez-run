import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import type { CardChoice, CardDetail, CardInteraction } from "./appApi";

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function sameSet(left: Iterable<string>, right: Iterable<string>) {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function seedFor(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function shuffled(items: CardChoice[], seedText: string) {
  const copy = [...items];
  let state = seedFor(seedText) || 0x9e3779b9;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const selected = (state >>> 0) % (index + 1);
    [copy[index], copy[selected]] = [copy[selected], copy[index]];
  }
  if (copy.length > 1 && copy.every((item, index) => item.id === items[index]?.id)) [copy[0], copy[1]] = [copy[1], copy[0]];
  return copy;
}

function mediaSource(reference: string) {
  const prefix = "deez-media://sha256:";
  if (reference.startsWith(prefix)) {
    const hash = reference.slice(prefix.length);
    return /^[0-9a-f]{64}$/.test(hash) ? `/api/v1/media/${hash}` : undefined;
  }
  if (reference.startsWith("/") && !reference.startsWith("//")) return reference;
  return undefined;
}

function ratingWord(value: boolean | undefined) {
  if (value === undefined) return "Not answered";
  return value ? "Correct" : "Check the answer";
}

export function StudyInteraction(props: { card: CardDetail; revealed: boolean }) {
  const [typed, setTyped] = createSignal("");
  const [single, setSingle] = createSignal<string>();
  const [multiple, setMultiple] = createSignal<string[]>([]);
  const [ordered, setOrdered] = createSignal<CardChoice[]>([]);

  createEffect(() => {
    const card = props.card;
    setTyped("");
    setSingle(undefined);
    setMultiple([]);
    setOrdered(card.rendered.interaction.type === "ordering" ? shuffled(card.rendered.interaction.items, card.id) : []);
  });

  const interaction = () => props.card.rendered.interaction;
  const correctness = createMemo<boolean | undefined>(() => {
    const current = interaction();
    if (current.type === "type_answer") return typed().trim() ? normalize(typed()) === normalize(current.answer) : undefined;
    if (current.type === "single_choice") return single() ? single() === current.correct_id : undefined;
    if (current.type === "multiple_choice") return multiple().length ? sameSet(multiple(), current.correct_ids) : undefined;
    if (current.type === "ordering") return ordered().length ? ordered().every((item, index) => item.id === current.items[index]?.id) : undefined;
    return undefined;
  });

  function toggleChoice(id: string) {
    setMultiple((values) => values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
  }

  function move(id: string, direction: -1 | 1) {
    setOrdered((items) => {
      const index = items.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= items.length) return items;
      const copy = [...items];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  return <div data-deez="study-interaction" data-interaction={interaction().type}>
    <Show when={interaction().type === "type_answer"}>{() => {
      const current = interaction() as Extract<CardInteraction, { type: "type_answer" }>;
      return <>
        <label data-deez="answer-field">
          <span>Your answer</span>
          <input data-deez="study-input" value={typed()} autocomplete="off" autocapitalize="off" disabled={props.revealed} onInput={(event) => setTyped(event.currentTarget.value)} />
        </label>
        <Show when={props.revealed}>
          <div data-deez="answer-feedback" data-correct={correctness() === true ? "true" : "false"}>
            <strong>{ratingWord(correctness())}</strong>
            <span>Answer: {current.answer}</span>
            <Show when={typed().trim()}><small>You answered: {typed()}</small></Show>
          </div>
        </Show>
      </>;
    }}</Show>

    <Show when={interaction().type === "single_choice"}>{() => {
      const current = interaction() as Extract<CardInteraction, { type: "single_choice" }>;
      return <div data-deez="choice-grid" role="radiogroup" aria-label="Choose one answer">
        <For each={current.choices}>{(choice, index) => {
          const selected = () => single() === choice.id;
          const correct = () => props.revealed && choice.id === current.correct_id;
          const wrong = () => props.revealed && selected() && choice.id !== current.correct_id;
          return <button type="button" data-deez="choice" data-selected={selected() ? "true" : "false"} data-correct={correct() ? "true" : undefined} data-wrong={wrong() ? "true" : undefined} disabled={props.revealed} onClick={() => setSingle(choice.id)}>
            <span data-deez="choice-key">{index() + 1}</span><span>{choice.text}</span>
          </button>;
        }}</For>
        <Show when={props.revealed}><div data-deez="answer-feedback" data-correct={correctness() === true ? "true" : "false"}><strong>{ratingWord(correctness())}</strong></div></Show>
      </div>;
    }}</Show>

    <Show when={interaction().type === "multiple_choice"}>{() => {
      const current = interaction() as Extract<CardInteraction, { type: "multiple_choice" }>;
      return <div data-deez="choice-grid" aria-label="Choose all correct answers">
        <For each={current.choices}>{(choice) => {
          const selected = () => multiple().includes(choice.id);
          const correct = () => props.revealed && current.correct_ids.includes(choice.id);
          const wrong = () => props.revealed && selected() && !current.correct_ids.includes(choice.id);
          return <button type="button" data-deez="choice" data-selected={selected() ? "true" : "false"} data-correct={correct() ? "true" : undefined} data-wrong={wrong() ? "true" : undefined} disabled={props.revealed} onClick={() => toggleChoice(choice.id)}>
            <span data-deez="choice-check">{selected() ? "✓" : "□"}</span><span>{choice.text}</span>
          </button>;
        }}</For>
        <Show when={props.revealed}><div data-deez="answer-feedback" data-correct={correctness() === true ? "true" : "false"}><strong>{ratingWord(correctness())}</strong><span>Select every highlighted correct option.</span></div></Show>
      </div>;
    }}</Show>

    <Show when={interaction().type === "ordering"}>{() => {
      const current = interaction() as Extract<CardInteraction, { type: "ordering" }>;
      return <div data-deez="ordering">
        <p data-deez="interaction-help">Put the items in the correct order.</p>
        <For each={ordered()}>{(item, index) => {
          const correct = () => props.revealed && current.items[index()]?.id === item.id;
          return <div data-deez="ordering-row" data-correct={correct() ? "true" : undefined}>
            <span data-deez="ordering-position">{index() + 1}</span>
            <span>{item.text}</span>
            <div data-deez="ordering-actions">
              <button type="button" aria-label={`Move ${item.text} up`} disabled={props.revealed || index() === 0} onClick={() => move(item.id, -1)}>↑</button>
              <button type="button" aria-label={`Move ${item.text} down`} disabled={props.revealed || index() === ordered().length - 1} onClick={() => move(item.id, 1)}>↓</button>
            </div>
          </div>;
        }}</For>
        <Show when={props.revealed}><div data-deez="answer-feedback" data-correct={correctness() === true ? "true" : "false"}><strong>{ratingWord(correctness())}</strong><span>Correct order: {current.items.map((item) => item.text).join(" → ")}</span></div></Show>
      </div>;
    }}</Show>

    <Show when={interaction().type === "image_occlusion"}>{() => {
      const current = interaction() as Extract<CardInteraction, { type: "image_occlusion" }>;
      const target = () => current.masks.find((mask) => mask.id === current.target_mask_id);
      const source = () => mediaSource(current.image_ref);
      return <div data-deez="occlusion">
        <Show when={target()?.prompt}><p data-deez="interaction-help">{target()?.prompt}</p></Show>
        <Show when={source()} fallback={<div data-deez="media-unavailable">Image media is not available on this device yet.<small>{current.image_ref}</small></div>}>
          {(src) => <div data-deez="occlusion-frame">
            <img src={src()} alt="Image occlusion study card" />
            <For each={current.masks}>{(mask) => <span
              data-deez="occlusion-mask"
              data-target={mask.id === current.target_mask_id ? "true" : "false"}
              data-revealed={props.revealed ? "true" : "false"}
              style={{ left: `${mask.x * 100}%`, top: `${mask.y * 100}%`, width: `${mask.width * 100}%`, height: `${mask.height * 100}%` }}
            />}</For>
          </div>}
        </Show>
        <Show when={props.revealed && target()}>{(mask) => <div data-deez="answer-feedback" data-correct="true"><strong>Revealed</strong><span>{mask().answer}</span></div>}</Show>
      </div>;
    }}</Show>
  </div>;
}
