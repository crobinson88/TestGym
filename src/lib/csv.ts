import { db } from "./db";
import { todayIsoDate } from "./utils";

const HEADERS = [
  "id",
  "exercise",
  "category",
  "weight",
  "reps",
  "weight_unit",
  "performed_at",
  "target_weight",
  "target_reps",
  "notes",
  "volume",
  "created_at",
  "updated_at",
] as const;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function buildSetsCsv(): Promise<string> {
  const [sets, exercises, categories] = await Promise.all([
    db.sets.toArray(),
    db.exercises.toArray(),
    db.categories.toArray(),
  ]);
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const catById = new Map(categories.map((c) => [c.id, c]));

  const live = sets
    .filter((s) => !s.deleted_at)
    .sort((a, b) =>
      a.performed_at < b.performed_at
        ? -1
        : a.performed_at > b.performed_at
          ? 1
          : a.created_at < b.created_at
            ? -1
            : 1,
    );

  const lines: string[] = [HEADERS.join(",")];
  for (const s of live) {
    const ex = exById.get(s.exercise_id);
    const cat = catById.get(s.category_id);
    lines.push(
      [
        s.id,
        ex?.name ?? "",
        cat?.name ?? "",
        s.weight,
        s.reps,
        s.weight_unit,
        s.performed_at,
        s.target_weight,
        s.target_reps,
        s.notes,
        s.weight * s.reps,
        s.created_at,
        s.updated_at,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export async function downloadSetsCsv() {
  const csv = await buildSetsCsv();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gym-export-${todayIsoDate()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
