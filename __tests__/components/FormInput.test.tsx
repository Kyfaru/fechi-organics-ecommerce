/**
 * Unit tests — FormInput component.
 *
 * Tests the normal render, error state (border + icon + message), and
 * label / id association for accessibility.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import FormInput from "@/components/auth/FormInput";

describe("FormInput", () => {
  it("renders the label and input", () => {
    render(<FormInput label="Email Address" />);
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });

  it("associates label with input via htmlFor / id", () => {
    render(<FormInput label="Email Address" id="email" />);
    const input = screen.getByRole("textbox", { name: /email address/i });
    expect(input).toHaveAttribute("id", "email");
  });

  it("does NOT show error state when no error prop is passed", () => {
    render(<FormInput label="Email Address" />);
    const input = screen.getByRole("textbox");
    expect(input).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows error message and alert role when error prop is set", () => {
    render(<FormInput label="Email Address" error="Email is required." />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Email is required.");
  });

  it("marks input aria-invalid=true when error prop is set", () => {
    render(<FormInput label="Email Address" error="Required" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("applies error border class when error prop is set", () => {
    render(<FormInput label="Email Address" error="Required" />);
    const input = screen.getByRole("textbox");
    expect(input.className).toMatch(/border-red-500/);
  });

  it("calls onChange when user types", async () => {
    const handleChange = vi.fn();
    render(<FormInput label="Email Address" onChange={handleChange} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "a");
    expect(handleChange).toHaveBeenCalled();
  });

  it("passes placeholder through to the native input", () => {
    render(<FormInput label="Email Address" placeholder="you@example.com" />);
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
  });

  it("disables the input when disabled prop is passed", () => {
    render(<FormInput label="Email Address" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
