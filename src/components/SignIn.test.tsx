import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignIn } from "./SignIn";

const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: unknown[]) => signInWithOtp(...args),
      verifyOtp: (...args: unknown[]) => verifyOtp(...args),
    },
  },
}));

beforeEach(() => {
  signInWithOtp.mockReset();
  verifyOtp.mockReset();
});

describe("SignIn", () => {
  it("rejects a non-allowed email without calling supabase", async () => {
    render(<SignIn />);
    const input = screen.getByLabelText(/email/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "stranger@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/single-user/i);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("sends the magic link for the allowed email and advances to the OTP stage", async () => {
    signInWithOtp.mockResolvedValue({ error: null });
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalledOnce());
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "charlie@theglassmarket.co" }),
    );
    expect(await screen.findByRole("button", { name: /verify code/i })).toBeInTheDocument();
  });

  it("verifies a 6-digit code through verifyOtp", async () => {
    signInWithOtp.mockResolvedValue({ error: null });
    verifyOtp.mockResolvedValue({ error: null });
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));
    await screen.findByRole("button", { name: /verify code/i });

    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify code/i }));

    await waitFor(() => expect(verifyOtp).toHaveBeenCalledOnce());
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "charlie@theglassmarket.co",
      token: "123456",
      type: "email",
    });
  });
});
