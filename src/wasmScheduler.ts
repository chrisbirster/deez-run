import type { Fsrs7Parameters, ReviewHistory, StudyPreview } from "./remoteApi";

type Rating = 1 | 2 | 3 | 4;
type Key = "again" | "hard" | "good" | "easy";

type SchedulerExports = WebAssembly.Exports & {
  deez_reset(): void;
  deez_set_weight(index: number, value: number): number;
  deez_set_desired_retention(value: number): number;
  deez_set_minimum_interval_days(value: number): number;
  deez_set_maximum_interval_days(value: number): number;
  deez_validate_parameters(): number;
  deez_append_review(rating: number, reviewedAtMs: bigint): number;
  deez_schedule(nowMs: bigint): number;
  deez_due_at_ms(rating: number): bigint;
  deez_interval_days(rating: number): number;
  deez_stability_days(): number;
  deez_difficulty(): number;
  deez_last_error(): number;
};

export type OfflineSchedule = {
  schedule: StudyPreview["schedule"];
  stability_days: number | null;
  difficulty: number | null;
};

let loading: Promise<SchedulerExports> | undefined;

async function instantiate() {
  const response = await fetch("/deez-scheduler.wasm", { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load Deez scheduler (${response.status}).`);
  let instance: WebAssembly.Instance;
  try {
    const result = await WebAssembly.instantiateStreaming(Promise.resolve(response.clone()), {});
    instance = result.instance;
  } catch {
    const result = await WebAssembly.instantiate(await response.arrayBuffer(), {});
    instance = result.instance;
  }
  return instance.exports as SchedulerExports;
}

async function exports() {
  if (!loading) loading = instantiate();
  return loading;
}

function check(code: number, api: SchedulerExports, operation: string) {
  if (code === 0) return;
  throw new Error(`${operation} failed in the shared Deez scheduler (${api.deez_last_error() || code}).`);
}

function finite(value: number) {
  return Number.isFinite(value) ? value : null;
}

function configure(api: SchedulerExports, parameters: Fsrs7Parameters) {
  api.deez_reset();
  if (parameters.weights.length !== 35) throw new Error("Cached FSRS-7 parameters have an invalid weight count.");
  parameters.weights.forEach((weight, index) => check(api.deez_set_weight(index, weight), api, "FSRS weight configuration"));
  check(api.deez_set_desired_retention(parameters.desired_retention), api, "FSRS retention configuration");
  check(api.deez_set_minimum_interval_days(parameters.minimum_interval_days), api, "FSRS minimum interval configuration");
  check(api.deez_set_maximum_interval_days(parameters.maximum_interval_days), api, "FSRS maximum interval configuration");
  check(api.deez_validate_parameters(), api, "FSRS parameter validation");
}

const candidates: Array<[Key, Rating]> = [
  ["again", 1],
  ["hard", 2],
  ["good", 3],
  ["easy", 4],
];

export async function scheduleHistory(parameters: Fsrs7Parameters, reviews: readonly ReviewHistory[], nowMs: number): Promise<OfflineSchedule> {
  const api = await exports();
  configure(api, parameters);
  for (const review of reviews) {
    check(api.deez_append_review(review.rating, BigInt(review.reviewed_at_ms)), api, "Review history replay");
  }
  check(api.deez_schedule(BigInt(nowMs)), api, "FSRS scheduling");
  const schedule = Object.fromEntries(candidates.map(([key, rating]) => [key, {
    rating,
    due_at_ms: Number(api.deez_due_at_ms(rating)),
    interval_days: api.deez_interval_days(rating),
  }])) as StudyPreview["schedule"];
  return {
    schedule,
    stability_days: finite(api.deez_stability_days()),
    difficulty: finite(api.deez_difficulty()),
  };
}

export async function warmScheduler() {
  await exports();
}
