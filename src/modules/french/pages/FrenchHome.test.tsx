import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import FrenchHome from "./FrenchHome";
import { RULE_QUESTIONS } from "../data/rules";
import { ruleTopics } from "../quiz";

const navigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

vi.mock("../hooks", () => ({
  useFrenchStats: () => undefined,
  useVocabDueCount: () => 0,
  useListeningDueCount: () => 0,
  useMasteredVocab: () => [],
  // One rule practised at 50%, so the picker carries an accuracy.
  useRuleStats: () => ({
    byRule: new Map([[RULE_QUESTIONS[0].id, { seen: 4, correct: 2 }]]),
    byTopic: new Map([["Noun Gender", { seen: 4, correct: 2 }]]),
  }),
}));

vi.mock("@/lib/online", () => ({ useOnline: () => true }));

const TOPICS = ruleTopics(RULE_QUESTIONS);
const GENDER = TOPICS[0]; // Noun Gender
const NEGATION = TOPICS.find((t) => t.topic === "Negation")!;

function startRules() {
  fireEvent.click(screen.getByRole("button", { name: /New rules test/ }));
  return navigate.mock.calls.at(-1)?.[0] as string;
}

// The picker is collapsed by default; open it before ticking anything.
function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: "Rules to practise", expanded: false }));
}

// Open a topic's rule list.
function expand(topic: string) {
  fireEvent.click(screen.getByRole("button", { name: topic, expanded: false }));
}

beforeEach(() => {
  sessionStorage.clear();
  navigate.mockReset();
});

describe("FrenchHome — rule picker", () => {
  it("draws from every rule until something is ticked", () => {
    render(<FrenchHome />);
    expect(screen.getByText(/10 grammar questions · all rules/)).toBeInTheDocument();
    expect(startRules()).toBe("/french/test/rules?n=10");
  });

  it("keeps the picker collapsed until asked, and summarises the pick in its header", () => {
    render(<FrenchHome />);
    const toggle = screen.getByRole("button", { name: "Rules to practise" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("checkbox", { name: `All rules in ${NEGATION.topic}` }));
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(toggle).getByText(NEGATION.topic)).toBeInTheDocument();
  });

  it("ticks a whole topic, and carries it as one token", () => {
    render(<FrenchHome />);
    openPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: `All rules in ${GENDER.topic}` }));
    expect(screen.getByText(/· Noun Gender/)).toBeInTheDocument();
    expect(startRules()).toBe("/french/test/rules?n=10&rules=t:noun-gender");
  });

  it("practises a single rule on its own", () => {
    render(<FrenchHome />);
    openPicker();
    expand(GENDER.topic);
    const first = GENDER.rules[0];
    fireEvent.click(screen.getByRole("checkbox", { name: first.prompt }));
    expect(screen.getByText(/1 grammar question · 1 rule/)).toBeInTheDocument();
    expect(startRules()).toBe(`/french/test/rules?n=10&rules=${first.id}`);
  });

  it("practises several rules at once, across topics", () => {
    render(<FrenchHome />);
    openPicker();
    expand(GENDER.topic);
    expand(NEGATION.topic);
    fireEvent.click(screen.getByRole("checkbox", { name: GENDER.rules[0].prompt }));
    fireEvent.click(screen.getByRole("checkbox", { name: GENDER.rules[1].prompt }));
    fireEvent.click(screen.getByRole("checkbox", { name: NEGATION.rules[0].prompt }));

    expect(screen.getByText(/3 grammar questions · 3 rules/)).toBeInTheDocument();
    expect(startRules()).toBe(
      `/french/test/rules?n=10&rules=${GENDER.rules[0].id},${GENDER.rules[1].id},${NEGATION.rules[0].id}`,
    );
  });

  it("shows a topic as part-picked, and Clear puts everything back", () => {
    render(<FrenchHome />);
    openPicker();
    expand(GENDER.topic);
    fireEvent.click(screen.getByRole("checkbox", { name: GENDER.rules[0].prompt }));

    const topicBox = screen.getByRole("checkbox", { name: `All rules in ${GENDER.topic}` });
    expect(topicBox).toHaveAttribute("aria-checked", "mixed");

    // Ticking the topic box from part-picked takes the whole topic.
    fireEvent.click(topicBox);
    expect(topicBox).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/· Noun Gender/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Clear/ }));
    expect(screen.getByText(/· all rules/)).toBeInTheDocument();
    expect(startRules()).toBe("/french/test/rules?n=10");
  });

  it("warns when the selection holds fewer rules than the chosen length", () => {
    render(<FrenchHome />);
    openPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: `All rules in ${NEGATION.topic}` }));
    const n = NEGATION.rules.length;
    expect(n).toBeLessThan(10);
    expect(
      screen.getByText(new RegExp(`Only ${n} questions in this selection`)),
    ).toBeInTheDocument();
  });

  it("shows per-rule and per-topic accuracy where there's history", () => {
    render(<FrenchHome />);
    openPicker();
    const topicRow = screen.getByRole("button", { name: GENDER.topic, expanded: false });
    expect(within(topicRow).getByText("50%")).toBeInTheDocument();

    expand(GENDER.topic);
    const ruleRow = screen.getByRole("checkbox", { name: RULE_QUESTIONS[0].prompt });
    expect(within(ruleRow).getByText("50%")).toBeInTheDocument();
  });
});
