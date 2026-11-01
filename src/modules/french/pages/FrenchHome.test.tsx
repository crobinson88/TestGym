import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FrenchHome from "./FrenchHome";
import { RULE_QUESTIONS } from "../data/rules";

const navigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

vi.mock("../hooks", () => ({
  useFrenchStats: () => undefined,
  useVocabDueCount: () => 0,
  useListeningDueCount: () => 0,
  useMasteredVocab: () => [],
  // "Noun Gender" practised at 50%, so the chip carries an accuracy.
  useRuleTopicStats: () => new Map([["Noun Gender", { seen: 4, correct: 2 }]]),
}));

vi.mock("@/lib/online", () => ({ useOnline: () => true }));

const countOf = (topic: string) => RULE_QUESTIONS.filter((r) => r.topic === topic).length;

function startRules() {
  fireEvent.click(screen.getByRole("button", { name: /New rules test/ }));
  return navigate.mock.calls.at(-1)?.[0] as string;
}

beforeEach(() => {
  sessionStorage.clear();
  navigate.mockReset();
});

describe("FrenchHome — rules topic picker", () => {
  it("draws from every topic until one is picked", () => {
    render(<FrenchHome />);
    expect(screen.getByText(/10 grammar questions · all topics/)).toBeInTheDocument();
    expect(startRules()).toBe("/french/test/rules?n=10");
  });

  it("passes the picked topics to the test as slugs", () => {
    render(<FrenchHome />);
    fireEvent.click(screen.getByRole("button", { name: /^Noun Gender/ }));
    expect(screen.getByText(/· Noun Gender/)).toBeInTheDocument();
    expect(startRules()).toBe("/french/test/rules?n=10&topics=noun-gender");

    fireEvent.click(screen.getByRole("button", { name: /^Negation/ }));
    expect(screen.getByText(/10 grammar questions · 2 topics/)).toBeInTheDocument();
    expect(startRules()).toBe("/french/test/rules?n=10&topics=noun-gender,negation");
  });

  it("unticking the last topic, or All topics, goes back to the whole pool", () => {
    render(<FrenchHome />);
    const gender = screen.getByRole("button", { name: /^Noun Gender/ });
    fireEvent.click(gender);
    fireEvent.click(gender);
    expect(startRules()).toBe("/french/test/rules?n=10");

    fireEvent.click(screen.getByRole("button", { name: /^Negation/ }));
    fireEvent.click(screen.getByRole("button", { name: "All topics" }));
    expect(startRules()).toBe("/french/test/rules?n=10");
  });

  it("warns when the selection holds fewer questions than the chosen length", () => {
    render(<FrenchHome />);
    const available = countOf("Negation");
    expect(available).toBeLessThan(10);
    fireEvent.click(screen.getByRole("button", { name: /^Negation/ }));
    expect(
      screen.getByText(new RegExp(`Only ${available} questions in this selection`)),
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${available} grammar questions · Negation`))).toBeInTheDocument();
  });

  it("shows each topic's question count, and its accuracy once practised", () => {
    render(<FrenchHome />);
    expect(
      screen.getByRole("button", { name: `Noun Gender ${countOf("Noun Gender")} · 50%` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Negation ${countOf("Negation")}` }),
    ).toBeInTheDocument();
  });
});
