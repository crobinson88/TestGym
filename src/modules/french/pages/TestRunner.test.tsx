import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Question } from "../quiz";
import TestRunner from "./TestRunner";

// A fixed 2-word listening/ordering question: bank of the two spoken words plus
// one decoy, correct build is "le chien" then "grand".
const ORDER_Q: Question = {
  id: "phrase:le chien grand",
  prompt: "le chien grand",
  sub: "Build the phrase you heard (2 words)",
  choices: ["grand", "le chien", "vite"],
  answer: 0,
  sequence: ["le chien", "grand"],
  explanation: "le chien grand — dog · big",
  audioText: "le chien grand",
};

const navigate = vi.fn();
const addFrenchAttempt = vi.fn().mockResolvedValue(undefined);

vi.mock("react-router-dom", () => ({
  useParams: () => ({ kind: "listening" }),
  useSearchParams: () => [new URLSearchParams("n=1&words=2&speed=normal")],
  useNavigate: () => navigate,
  Navigate: () => null,
}));

vi.mock("../hooks", () => ({
  useListeningSchedules: () => new Map(),
  useVocabSchedules: () => new Map(),
  useVocabHistory: () => new Map(),
}));

vi.mock("../speech", () => ({
  speakFrench: vi.fn(),
  cancelSpeech: vi.fn(),
}));

vi.mock("@/lib/sync", () => ({
  syncEngine: { mutations: { addFrenchAttempt: (...a: unknown[]) => addFrenchAttempt(...a) } },
}));

vi.mock("../quiz", async (importActual) => {
  const actual = await importActual<typeof import("../quiz")>();
  return { ...actual, generateTest: () => [{ ...ORDER_Q }] };
});

beforeEach(() => {
  navigate.mockReset();
  addFrenchAttempt.mockReset();
  addFrenchAttempt.mockResolvedValue(undefined);
});

describe("TestRunner — listening word-ordering", () => {
  it("marks a phrase correct only when the words are built in the order heard", async () => {
    render(<TestRunner />);

    // Check is disabled until every slot is filled.
    expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "le chien" }));
    fireEvent.click(screen.getByRole("button", { name: "grand" }));

    const check = screen.getByRole("button", { name: "Check" });
    expect(check).toBeEnabled();
    fireEvent.click(check);

    expect(screen.getByText("Correct")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(addFrenchAttempt).toHaveBeenCalledOnce());
    expect(addFrenchAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "listening", total: 1, correct: 1 }),
    );
  });

  it("marks a phrase wrong when the words are out of order and reveals the answer", async () => {
    render(<TestRunner />);

    // Right words, wrong order.
    fireEvent.click(screen.getByRole("button", { name: "grand" }));
    fireEvent.click(screen.getByRole("button", { name: "le chien" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByText("Answer: le chien grand")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(addFrenchAttempt).toHaveBeenCalledOnce());
    expect(addFrenchAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "listening", total: 1, correct: 0 }),
    );
  });
});
