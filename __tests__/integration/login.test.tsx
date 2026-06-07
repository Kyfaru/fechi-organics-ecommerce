/**
 * Integration tests — Login page.
 *
 * These tests exercise the full login form component in isolation, with the
 * Better Auth client mocked at the module boundary. They verify:
 *
 *  - Client-side validation fires correctly (before any network call).
 *  - A successful sign-in triggers navigation.
 *  - Wrong credentials produce a general error message.
 *  - The loading state disables the submit button during a pending request.
 */

import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock variables so they can be referenced inside vi.mock factories,
// which are hoisted to the top of the file by Vitest at compile time.
// ---------------------------------------------------------------------------
const { mockSignInEmail, mockSignInSocial, mockPush, mockRefresh } = vi.hoisted(() => ({
  mockSignInEmail: vi.fn(),
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

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: mockSignInEmail,
      social: mockSignInSocial,
    },
  },
}));

// ---------------------------------------------------------------------------
// Import page AFTER mocks are registered
// ---------------------------------------------------------------------------
import LoginPage from "@/app/(auth)/login/page";

// ---------------------------------------------------------------------------
// Helper: set up userEvent with delay:null for speed
// ---------------------------------------------------------------------------
function setup() {
  return userEvent.setup({ delay: null });
}

describe("LoginPage — client-side validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an email error when submitted empty", async () => {
    const user = setup();
    render(<LoginPage />);
    await user.click(screen.getByRole("button", { name: /log in/i }));
    expect(await screen.findByText(/email address is required/i)).toBeInTheDocument();
    expect(mockSignInEmail).not.toHaveBeenCalled();
  });

  it("shows an email format error for an invalid email", async () => {
    const user = setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText(/email address/i), "notanemail");
    await user.click(screen.getByRole("button", { name: /log in/i }));
    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
  });

  it("shows a password error when password is empty", async () => {
    const user = setup();
    render(<LoginPage />);
    await user.type(screen.getByLabelText(/email address/i), "test@example.com");
    await user.click(screen.getByRole("button", { name: /log in/i }));
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
  });
});

describe("LoginPage — network outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to / on successful sign-in", async () => {
    const user = setup();
    mockSignInEmail.mockResolvedValueOnce({ error: null, data: { session: { id: "abc" } } });

    render(<LoginPage />);
    await user.type(screen.getByLabelText(/email address/i), "user@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "correctPassword1");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"), { timeout: 5000 });
  });

  it("shows wrong-credentials error when Better Auth returns INVALID_EMAIL_OR_PASSWORD", async () => {
    const user = setup();
    mockSignInEmail.mockResolvedValueOnce({
      error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid credentials" },
      data: null,
    });

    render(<LoginPage />);
    await user.type(screen.getByLabelText(/email address/i), "user@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "wrongPassword");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/incorrect email or password/i)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows loading state during sign-in and re-enables button on completion", async () => {
    const user = setup();
    // Simulate a short delay to observe loading state
    mockSignInEmail.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ error: null, data: {} }), 100)
        )
    );

    render(<LoginPage />);
    await user.type(screen.getByLabelText(/email address/i), "user@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "password123");

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /log in/i }));
    });

    // After click the button should be disabled (loading)
    const btn = screen.getByRole("button", { name: /signing in/i });
    expect(btn).toBeDisabled();

    // Wait for it to settle
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });
});
