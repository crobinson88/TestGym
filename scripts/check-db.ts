import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(url, key);

const { data, error } = await sb.rpc("gym_row_counts").single<{
  sets_count: number;
  exercises_count: number;
  categories_count: number;
}>();

if (error || !data) {
  console.error("DB check failed:", error?.message ?? "no data");
  process.exit(1);
}

console.log(`sets:       ${data.sets_count}`);
console.log(`exercises:  ${data.exercises_count}`);
console.log(`categories: ${data.categories_count}`);

if (data.sets_count < 1456) {
  console.error(`expected sets >= 1456, got ${data.sets_count}`);
  process.exit(1);
}

console.log("OK — DB connection verified.");
