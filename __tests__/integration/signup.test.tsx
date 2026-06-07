/**
 * Integration tests — Signup page.
 *
 * Verifies client-side validation rules:
 *  - Required fields (first name, last name, country, city, email, password, confirm password, terms)
 *  - Password mismatch
 *  - Password too short
 *  - Missing terms acceptance
 *  - Duplicate email error from Better Auth
 *  - Successful signup redirects to /
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock variables
// ---------------------------------------------------------------------------
const { mockSignUpEmail, mockSignInSocial, mockPush, mockRefresh } = vi.hoisted(() => ({
  mockSignUpEmail: vi.fn(),
  mockSignInSocial: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// react-phone-number-input: stub with a plain input to avoid complex rendering
vi.mock("react-phone-number-input", () => ({
  default: ({
    onChange,
    value,
    id,
  }: {
    onChange: (v: string) => void;
    value: string;
    id?: string;
  }) => (
    <input
      id={id ?? "phone"}
      data-testid="phone-input"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signUp: { email: mockSignUpEmail },
    signIn: { social: mockSignInSocial },
  },
}));

import SignupPage from "@/app/(auth)/signup/page";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function setup() {
  return userEvent.setup({ delay: null });
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/first name/i), "Jane");
  await user.type(screen.getByLabelText(/last name/i), "Smith");
  await user.selectOptions(screen.getByLabelText(/country/i), "US");
  await user.type(screen.getByLabelText(/city/i), "New York");
  await user.type(screen.getByLabelText(/email address/i), "jane@example.com");
  await user.type(screen.getByLabelText(/^password$/i), "SecurePass1");
  await user.type(screen.getByLabelText(/confirm password/i), "SecurePass1");
  await user.click(screen.getByRole("checkbox"));
}

describe("SignupPage — client-side validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows required errors when form is submitted completely empty", async () => {
    const user = setup();
    render(<SignupPage />);
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(await screen.findByText(/first name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/last name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/please select your country/i)).toBeInTheDocument();
    expect(screen.getByText(/city is required/i)).toBeInTheDocument();
    expect(screen.getByText(/email address is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it("shows password mismatch error when passwords differ", async () => {
    const user = setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Smith");
    await user.selectOptions(screen.getByLabelText(/country/i), "US");
    await user.type(screen.getByLabelText(/city/i), "NYC");
    await user.type(screen.getByLabelText(/email address/i), "jane@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "Password1");
    await user.type(screen.getByLabelText(/confirm password/i), "DifferentPass");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
  });

  it("shows too-short error when password is under 8 characters", async () => {
    const user = setup();
    render(<SignupPage />);
    await user.type(screen.getByLabelText(/^password$/i), "short");
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
  });

  it("shows terms error when checkbox is not checked", async () => {
    const user = setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Smith");
    await user.selectOptions(screen.getByLabelText(/country/i), "US");
    await user.type(screen.getByLabelText(/city/i), "NYC");
    await user.type(screen.getByLabelText(/email address/i), "jane@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "Password1");
    await user.type(screen.getByLabelText(/confirm password/i), "Password1");
    // Deliberately NOT checking the checkbox
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(await screen.findByText(/must accept the terms/i)).toBeInTheDocument();
  });
});

describe("SignupPage — network outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to / on successful signup", async () => {
    const user = setup();
    mockSignUpEmail.mockResolvedValueOnce({ error: null, data: { user: { id: "1" } } });

    render(<SignupPage />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(mockSignUpEmail).toHaveBeenCalledOnce();
      expect(mockPush).toHaveBeenCalledWith("/");
    }, { timeout: 5000 });
  });

  it("shows duplicate email error when Better Auth returns USER_ALREADY_EXISTS", async () => {
    const user = setup();
    mockSignUpEmail.mockResolvedValueOnce({
      error: { code: "USER_ALREADY_EXISTS", message: "Email taken" },
      data: null,
    });

    render(<SignupPage />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(
      await screen.findByText(/account with this email already exists/i)
    ).toBeInTheDocument();
  });
});
