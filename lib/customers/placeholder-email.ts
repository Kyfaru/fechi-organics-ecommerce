// Walk-in customers created without an email get a placeholder address (see
// lib/customers/find-or-create-walkin.ts) so `user.email`'s required/unique
// constraint is satisfied — surface "No email" instead of the fake address
// anywhere it would otherwise be shown or reused.
export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith("@instore.local");
}
