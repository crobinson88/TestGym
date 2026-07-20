import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TestRunner from "./TestRunner";

const navigate = vi.fn();
const addFrenchAttempt = vi.fn().mockResolvedValue(undefined);
const fetchSentences = vi.fn();

// words=2 → multi-word listening, which now generates a sentence server-side.
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
  useMasteredVocab: () => [
    { rank: 1, fr: "le chien", en: "dog", pos: "noun", gender: "m" },
    { rank: 2, fr: "grand", en: "big", pos: "adjective" },
    { rank: 3, fr: "vite", en: "fast", pos: "adverb" },
  ],
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session: { access_token: "tok" } }) }));

vi.mock("../sentences", () => ({
  fetchSentences: (...a: unknown[]) => fetchSentences(...a),
}));

vi.mock("../speech", () => ({
  speakFrench: vi.fn(),
  cancelSpeech: vi.fn(),
}));

vi.mock("@/lib/sync", () => ({
  syncEngine: { mutations: { addFrenchAttempt: (...a: unknown[]) => addFrenchAttempt(...a) } },
}));

beforeEach(() => {
  navigate.mockReset();
  addFrenchAttempt.mockReset();
  addFrenchAttempt.mockResolvedValue(undefined);
  fetchSentences.mockReset();
  fetchSentences.mockResolvedValue([
    { fr: "le chien grand", en: "the big dog", words: ["le chien", "grand"] },
  ]);
});

describe("TestRunner — listening sentence ordering", () => {
  it("marks a sentence correct only when rebuilt in order AND the meaning typed", async () => {
    render(<TestRunner />);
    // The word bank appears once the sentence has been generated.
    await screen.findByRole("button", { name: "le chien" });

    expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "le chien" }));
    fireEvent.click(screen.getByRole("button", { name: "grand" }));

    const check = screen.getByRole("button", { name: "Check" });
    expect(check).toBeEnabled();
    fireEvent.click(check);

    expect(screen.getByText("Correct")).toBeInTheDocument();

    // The meaning step: type what the sentence means, then check.
    fireEvent.change(screen.getByPlaceholderText("Type the meaning"), {
      target: { value: "the big dog" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(addFrenchAttempt).toHaveBeenCalledOnce());
    expect(addFrenchAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "listening", total: 1, correct: 1 }),
    );
  });

  it("marks a round wrong when the order is right but the meaning is wrong", async () => {
    render(<TestRunner />);
    await screen.findByRole("button", { name: "le chien" });

    fireEvent.click(screen.getByRole("button", { name: "le chien" }));
    fireEvent.click(screen.getByRole("button", { name: "grand" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    fireEvent.change(screen.getByPlaceholderText("Type the meaning"), {
      target: { value: "the small cat" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByText("Answer: the big dog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(addFrenchAttempt).toHaveBeenCalledOnce());
    expect(addFrenchAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "listening", total: 1, correct: 0 }),
    );
  });

  it("marks a sentence wrong when out of order and reveals the answer", async () => {
    render(<TestRunner />);
    await screen.findByRole("button", { name: "grand" });

    // Right words, wrong order.
    fireEvent.click(screen.getByRole("button", { name: "grand" }));
    fireEvent.click(screen.getByRole("button", { name: "le chien" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByText("Answer: le chien grand")).toBeInTheDocument();

    // Even with the meaning typed correctly, a wrong order fails the round.
    fireEvent.change(screen.getByPlaceholderText("Type the meaning"), {
      target: { value: "the big dog" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(addFrenchAttempt).toHaveBeenCalledOnce());
    expect(addFrenchAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "listening", total: 1, correct: 0 }),
    );
  });

  it("surfaces an error with a retry when generation fails", async () => {
    fetchSentences.mockReset();
    fetchSentences.mockRejectedValueOnce(new Error("boom"));
    render(<TestRunner />);
    await screen.findByText("boom");
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });
});
