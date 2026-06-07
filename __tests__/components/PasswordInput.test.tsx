/**
 * Unit tests — PasswordInput component.
 *
 * Tests the password show/hide toggle, aria attributes,
 * and error state display.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import PasswordInput from "@/components/auth/PasswordInput";

describe("PasswordInput", () => {
  it("renders as type=password by default (text is hidden)", () => {
    render(<PasswordInput label="Password" />);
    const input = screen.getByLabelText(/^password$/i);
    expect(input).toHaveAttribute("type", "password");
  });

  it("shows text when the show-password button is clicked", async () => {
    render(<PasswordInput label="Password" />);
    const toggleBtn = screen.getByRole("button", { name: /show password/i });
    await userEvent.click(toggleBtn);
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("type", "text");
  });

  it("hides text when the hide-password button is clicked after reveal", async () => {
    render(<PasswordInput label="Password" />);
    const showBtn = screen.getByRole("button", { name: /show password/i });
    await userEvent.click(showBtn);
    const hideBtn = screen.getByRole("button", { name: /hide password/i });
    await userEvent.click(hideBtn);
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("type", "password");
  });

  it("shows error message when error prop is passed", () => {
    render(<PasswordInput label="Password" error="Password is required." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Password is required.");
  });

  it("marks input aria-invalid when error prop is set", () => {
    render(<PasswordInput label="Password" error="Required" />);
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("calls onChange handler when user types", async () => {
    const handleChange = vi.fn();
    render(<PasswordInput label="Password" onChange={handleChange} />);
    const input = screen.getByLabelText(/^password$/i);
    await userEvent.type(input, "s");
    expect(handleChange).toHaveBeenCalled();
  });

  it("disables input when disabled prop is passed", () => {
    render(<PasswordInput label="Password" disabled />);
    expect(screen.getByLabelText(/^password$/i)).toBeDisabled();
  });
});
