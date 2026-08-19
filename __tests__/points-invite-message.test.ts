import { describe, it, expect } from "vitest";
import {
  buildInviteMessage,
  buildWhatsAppShareUrl,
  INVITE_MAX_CHARS,
} from "@/lib/points/invite-message";

const CODE = "REF-DKE5KL";

describe("buildInviteMessage", () => {
  it("fits in one SMS segment", () => {
    const msg = buildInviteMessage({ referralCode: CODE, baseUrl: "https://fechiorganics.com" });
    expect(msg.length).toBeLessThanOrEqual(INVITE_MAX_CHARS);
  });

  it("stays under the limit even on a long preview domain", () => {
    const msg = buildInviteMessage({
      referralCode: CODE,
      baseUrl: "https://fechi-organics-staging-preview-abc123.vercel.app",
    });
    expect(msg.length).toBeLessThanOrEqual(INVITE_MAX_CHARS);
    // The shop link and the code are what matter — those survive the trim.
    expect(msg).toContain(CODE);
    expect(msg).toContain("/shop");
  });

  it("keeps the how-it-works link when there is room", () => {
    const msg = buildInviteMessage({ referralCode: CODE, baseUrl: "https://fechiorganics.com" });
    expect(msg).toContain("/loyalty-points");
  });

  it("is written in the first person", () => {
    const msg = buildInviteMessage({ referralCode: CODE, baseUrl: "https://fechiorganics.com" });
    expect(msg.startsWith("Hi! I use")).toBe(true);
  });

  it("bolds the code for WhatsApp", () => {
    const msg = buildInviteMessage({ referralCode: CODE, baseUrl: "https://fechiorganics.com" });
    expect(msg).toContain(`*${CODE}*`);
  });

  it("promises both the discount and the points", () => {
    const msg = buildInviteMessage({ referralCode: CODE, baseUrl: "https://fechiorganics.com" });
    expect(msg).toContain("10% off");
    expect(msg).toMatch(/earn points/i);
  });

  it("uppercases and trims the code", () => {
    const msg = buildInviteMessage({ referralCode: "  ref-abc123  ", baseUrl: "https://x.com" });
    expect(msg).toContain("*REF-ABC123*");
  });

  it("does not double the slash on a trailing-slash base url", () => {
    const msg = buildInviteMessage({ referralCode: CODE, baseUrl: "https://fechiorganics.com/" });
    expect(msg).not.toContain("//shop");
  });

  it("leaves links bare so SMS clients auto-link them", () => {
    const msg = buildInviteMessage({ referralCode: CODE, baseUrl: "https://fechiorganics.com" });
    // No markdown link syntax, which SMS renders literally.
    expect(msg).not.toMatch(/\]\(/);
  });
});

describe("buildWhatsAppShareUrl", () => {
  it("encodes the message into a wa.me link", () => {
    const url = buildWhatsAppShareUrl("Hi! code *REF-X* & 10% off");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe("Hi! code *REF-X* & 10% off");
  });
});
