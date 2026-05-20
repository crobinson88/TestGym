import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignIn } from "./SignIn";

const signInWithPassword = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
    },
  },
}));

beforeEach(() => {
  signInWithPassword.mockReset();
});

describe("SignIn", () => {
  it("rejects a non-allowed email without calling supabase", async () => {
    render(<SignIn />);
    const input = screen.getByLabelText(/email/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "stranger@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/single-user/i);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("signs in the allowed email with the entered password", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    render(<SignIn />);
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledOnce());
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "charlie@theglassmarket.co",
      password: "hunter2",
    });
  });

  it("surfaces a sign-in error from supabase", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    render(<SignIn />);
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid login credentials/i);
  });
});
