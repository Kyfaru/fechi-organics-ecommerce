import { describe, it, expect } from "vitest";
import { roles } from "@/lib/permissions";

describe("lib/permissions ac/roles matrix", () => {
  it("manager can manage products but has no staff access", () => {
    expect(roles.manager.authorize({ products: ["create"] }).success).toBe(true);
    expect(roles.manager.authorize({ staff: ["view"] }).success).toBe(false);
  });

  it("finance is narrowed to view-only on finance/analytics for other roles", () => {
    expect(roles.finance.authorize({ finance: ["export"] }).success).toBe(true);
    expect(roles.manager.authorize({ finance: ["export"] }).success).toBe(false);
    expect(roles.manager.authorize({ finance: ["view"] }).success).toBe(true);
  });

  it("viewer sees only the dashboard and notifications", () => {
    expect(roles.viewer.authorize({ dashboard: ["view"] }).success).toBe(true);
    expect(roles.viewer.authorize({ notifications: ["view"] }).success).toBe(true);
    expect(roles.viewer.authorize({ analytics: ["view"] }).success).toBe(false);
  });

  it("admin and super_admin both hold staff:assign_roles", () => {
    expect(roles.admin.authorize({ staff: ["assign_roles"] }).success).toBe(true);
    expect(roles.super_admin.authorize({ staff: ["assign_roles"] }).success).toBe(true);
  });

  it("inventory is narrowed to view-only on orders", () => {
    expect(roles.inventory.authorize({ orders: ["view"] }).success).toBe(true);
    expect(roles.inventory.authorize({ orders: ["refund"] }).success).toBe(false);
  });

  it("every role gets notifications view+manage (avoids a real regression)", () => {
    for (const role of Object.values(roles)) {
      expect(role.authorize({ notifications: ["view", "manage"] }).success).toBe(true);
    }
  });
});
