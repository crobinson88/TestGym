import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Minus, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { RULE_QUESTIONS } from "./data/rules";
import { useRuleStats } from "./hooks";
import { pct, type TopicAccuracy } from "./stats";
import {
  describeRuleSelection,
  ruleTopics,
  toggleRule,
  toggleTopicRules,
  topicSelectionState,
  type RuleTopicOption,
  type TopicSelectionState,
} from "./quiz";

function Accuracy({ stat }: { stat: TopicAccuracy | undefined }) {
  if (!stat || stat.seen === 0) return null;
  const rate = stat.correct / stat.seen;
  return (
    <span
      className={cn(
        "shrink-0 text-xs font-medium tabular-nums",
        rate >= 0.8 ? "text-success" : rate >= 0.5 ? "text-warn" : "text-danger",
      )}
    >
      {pct(rate)}
    </span>
  );
}

// A tri-state tick box: every rule in the topic, some of them, or none.
function TickBox({ state }: { state: TopicSelectionState | boolean }) {
  const value: TopicSelectionState =
    typeof state === "boolean" ? (state ? "all" : "none") : state;
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
        value === "none" ? "border-line bg-surface" : "border-accent bg-accent text-bg",
      )}
    >
      {value === "all" && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      {value === "some" && <Minus className="h-3.5 w-3.5" strokeWidth={3} />}
    </span>
  );
}

function TopicGroup({
  option,
  selected,
  onChange,
  byRule,
  byTopic,
}: {
  option: RuleTopicOption;
  selected: string[];
  onChange: (ids: string[]) => void;
  byRule: Map<string, TopicAccuracy> | undefined;
  byTopic: Map<string, TopicAccuracy> | undefined;
}) {
  const [open, setOpen] = useState(false);
  const picked = useMemo(() => new Set(selected), [selected]);
  const state = topicSelectionState(option, picked);
  const chosen = option.rules.filter((r) => picked.has(r.id)).length;

  return (
    <li className="border-b border-line/50 last:border-b-0">
      <div className="flex items-stretch">
        <button
          type="button"
          role="checkbox"
          aria-checked={state === "some" ? "mixed" : state === "all"}
          aria-label={`All rules in ${option.topic}`}
          onClick={() => onChange(toggleTopicRules(selected, option, state !== "all"))}
          className="flex min-h-11 items-center pl-4 pr-3"
        >
          <TickBox state={state} />
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-label={option.topic}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 flex-1 items-center gap-2 py-2 pr-4 text-left"
        >
          <span className="flex-1 text-sm font-medium">{option.topic}</span>
          <Accuracy stat={byTopic?.get(option.topic)} />
          <span className="shrink-0 text-xs tabular-nums text-muted">
            {chosen > 0 ? `${chosen}/${option.rules.length}` : option.rules.length}
          </span>
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
          )}
        </button>
      </div>
      {open && (
        <ul className="bg-surface2/40 pb-1">
          {option.rules.map((rule) => {
            const on = picked.has(rule.id);
            return (
              <li key={rule.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={rule.prompt}
                  onClick={() => onChange(toggleRule(selected, rule.id))}
                  className="flex min-h-11 w-full items-center gap-3 py-2 pl-11 pr-4 text-left"
                >
                  <TickBox state={on} />
                  <span className={cn("flex-1 text-sm", on ? "text-text" : "text-muted")}>
                    {rule.prompt}
                  </span>
                  <Accuracy stat={byRule?.get(rule.id)} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

// Pick exactly which grammar rules the next rules test draws from: a whole topic,
// a single rule, or any mix across topics. Picking nothing means every rule.
export default function RulePicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const options = useMemo(() => ruleTopics(RULE_QUESTIONS), []);
  const stats = useRuleStats();
  // Closed by default: 13 topics would otherwise push the other tests off the
  // phone screen for the common case of taking a test over everything.
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Rules to practise"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 text-left transition active:scale-[0.99]"
      >
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted" />
        <span className="flex-1 text-sm font-medium">Rules to practise</span>
        <span
          className={cn(
            "shrink-0 text-sm",
            selected.length > 0 ? "font-medium text-accent" : "text-muted",
          )}
        >
          {describeRuleSelection(selected, RULE_QUESTIONS)}
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
        )}
      </button>
      {open && (
        <>
          <div className="flex items-center justify-between gap-3 px-1">
            <span className="text-xs text-muted">
              Tick a topic for all its rules, or open it to pick single rules.
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="shrink-0 text-xs font-medium text-accent"
              >
                Clear ({selected.length})
              </button>
            )}
          </div>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {options.map((option) => (
              <TopicGroup
                key={option.slug}
                option={option}
                selected={selected}
                onChange={onChange}
                byRule={stats?.byRule}
                byTopic={stats?.byTopic}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
