"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { User, ShoppingBag, CreditCard } from "lucide-react";
import type { Value as PhoneValue } from "react-phone-number-input";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { NewOrderStepper, type NewOrderStep, type NewOrderStepKey } from "@/components/admin/orders/NewOrderStepper";
import CustomerPicker, { type CustomerPickerOption } from "@/components/admin/orders/CustomerPicker";
import ProductPickerDropdown, { type PickerProduct } from "@/components/admin/orders/ProductPickerDropdown";
import OrderCartList, { type OrderCartLine } from "@/components/admin/orders/OrderCartList";
import OrderSummary from "@/components/admin/orders/OrderSummary";
import PaymentStep from "@/components/admin/orders/PaymentStep";
import PhoneInput from "@/components/ui/PhoneInput";

// ---------------------------------------------------------------------------
// Normalizes a stored phone number (which may be missing the "+" country
// prefix, e.g. "0712345678") into the E.164 `Value` shape react-phone-number-
// input expects. Same normalization DeliveryClient uses for the checkout form.
// ---------------------------------------------------------------------------
function normalizePhone(phone: string | null | undefined): PhoneValue | undefined {
  if (!phone) return undefined;
  if (phone.startsWith("+")) return phone as PhoneValue;
  if (phone.startsWith("0")) return `+254${phone.slice(1)}` as PhoneValue;
  return phone as PhoneValue;
}

const STEPS: NewOrderStep[] = [
  { key: "customer", label: "Customer Details", description: "Find or add the walk-in customer", icon: User },
  { key: "products", label: "Products", description: "Add items to the order", icon: ShoppingBag },
  { key: "payment", label: "Payment", description: "Collect payment and confirm", icon: CreditCard },
];

/**
 * Shell for the admin "in-store order" creation wizard. Handles routing/layout,
 * the step-tracker interaction, the Customer Details step (via CustomerPicker),
 * and the Products step (via ProductPickerDropdown + OrderCartList + OrderSummary)
 * — the Payment step's submission flow is a separate follow-up task and remains
 * stubbed out here.
 */
export function NewOrderClient() {
  const [activeStep, setActiveStep] = useState<NewOrderStepKey>("customer");

  // ---------------------------------------------------------------------
  // Customer Details step — real state, driven by CustomerPicker.
  // null selectedCustomerId means "New customer" (the picker's pinned,
  // default-selected option); the three fields are always editable, whether
  // they were autofilled from an existing customer or started blank.
  // ---------------------------------------------------------------------
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState<PhoneValue | undefined>(undefined);
  const [customerEmail, setCustomerEmail] = useState("");

  // Same fetch/query pattern AdminCampaignsClient uses for MultiCustomerSelect
  // — reuses the existing /api/admin/customers endpoint, no new API route.
  const { data: customerOptions = [], isLoading: customersLoading } = useQuery<CustomerPickerOption[]>({
    queryKey: ["admin-customers-simple"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/admin/customers");
        const json = await res.json();
        const users = (json?.data?.users ?? []) as Array<{
          id: string;
          name: string;
          email: string;
          phone: string | null;
          image?: string;
        }>;
        return users.map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, image: u.image }));
      } catch (err) {
        console.error("[NewOrderClient] failed to load customers", err);
        return [];
      }
    },
  });

  function handleSelectCustomer(customer: CustomerPickerOption | null) {
    if (!customer) {
      // "New customer" — clear back to blank, editable fields.
      setSelectedCustomerId(null);
      setCustomerName("");
      setCustomerPhone(undefined);
      setCustomerEmail("");
      return;
    }
    // Autofill from the existing customer's record; all three fields stay
    // editable afterward so the admin can override anything.
    setSelectedCustomerId(customer.id);
    setCustomerName(customer.name ?? "");
    setCustomerPhone(normalizePhone(customer.phone));
    setCustomerEmail(customer.email ?? "");
  }

  // ---------------------------------------------------------------------
  // Products step — real state, driven by ProductPickerDropdown + OrderCartList.
  // Pure local component state: nothing here is a db.cart row, and nothing
  // persists until the order is actually submitted in a later task.
  // ---------------------------------------------------------------------
  const [cartItems, setCartItems] = useState<OrderCartLine[]>([]);

  function handleAddProduct(product: PickerProduct) {
    setCartItems((items) => {
      const existing = items.find((it) => it.productId === product.id);
      if (existing) {
        return items.map((it) =>
          it.productId === product.id ? { ...it, quantity: it.quantity + 1 } : it
        );
      }
      return [
        ...items,
        {
          productId: product.id,
          name: product.name,
          imageUrl: product.imageUrl,
          priceKes: product.priceKes,
          quantity: 1,
        },
      ];
    });
  }

  function handleIncrementItem(productId: string) {
    setCartItems((items) =>
      items.map((it) => (it.productId === productId ? { ...it, quantity: it.quantity + 1 } : it))
    );
  }

  function handleDecrementItem(productId: string) {
    setCartItems((items) => {
      const existing = items.find((it) => it.productId === productId);
      if (existing && existing.quantity <= 1) {
        return items.filter((it) => it.productId !== productId);
      }
      return items.map((it) =>
        it.productId === productId ? { ...it, quantity: it.quantity - 1 } : it
      );
    });
  }

  function handleRemoveItem(productId: string) {
    setCartItems((items) => items.filter((it) => it.productId !== productId));
  }

  const subtotalKes = cartItems.reduce((sum, it) => sum + it.priceKes * it.quantity, 0);
  const itemCount = cartItems.reduce((sum, it) => sum + it.quantity, 0);

  // ---------------------------------------------------------------------
  // Coupon — reuses GET /api/coupons/validate, the same endpoint and query
  // shape components/checkout/DeliveryClient.tsx already uses for the
  // storefront checkout. No new discount logic lives here.
  // ---------------------------------------------------------------------
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountKes: number } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  async function handleApplyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;

    setCouponLoading(true);
    setCouponError(null);
    try {
      const res = await fetch(`/api/coupons/validate?code=${encodeURIComponent(code)}&subtotal=${subtotalKes}`);
      const json = await res.json() as {
        ok: boolean;
        data?: { valid: boolean; discount?: { amountKes: number }; message?: string; error?: string };
        error?: { message: string };
      };
      if (!json.ok) {
        setCouponError(json.error?.message ?? "Could not validate coupon");
        return;
      }
      const data = json.data!;
      if (!data.valid) {
        setCouponError(data.error ?? "Invalid coupon code");
        return;
      }
      setAppliedCoupon({ code, discountKes: data.discount?.amountKes ?? 0 });
      setCouponInput("");
    } catch (err) {
      console.error("[NewOrderClient] coupon validation failed", err);
      setCouponError("Failed to validate coupon — please try again");
    } finally {
      setCouponLoading(false);
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponError(null);
  }

  const discountKes = appliedCoupon?.discountKes ?? 0;
  const totalKes = Math.max(subtotalKes - discountKes, 0);

  // Same validation contract the stepper already relies on: complete once
  // the phone field has a value (regardless of whether it came from an
  // existing customer or was typed in for a new one).
  const customerComplete = Boolean(customerPhone);
  const productsComplete = cartItems.length >= 1;
  const paymentUnlocked = customerComplete && productsComplete;

  const completedSteps: Record<NewOrderStepKey, boolean> = {
    customer: customerComplete,
    products: productsComplete,
    // Payment has no "complete" state in this shell — it's a terminal action
    // that a follow-up task will wire up to actually submit the order.
    payment: false,
  };

  function goToStep(step: NewOrderStepKey) {
    if (step === "payment" && !paymentUnlocked) return;
    setActiveStep(step);
  }

  return (
    <div className="min-h-screen pb-16">
      <PageHeader
        breadcrumbs={[
          { label: "Orders", href: "/admin/orders" },
          { label: "New Order", href: "/admin/orders/new" },
        ]}
        title="New In-Store Order"
        description="Create an order on behalf of a walk-in customer"
      />

      <div className="px-6 flex flex-col md:flex-row gap-6 items-start">
        {/* ── Sidebar step tracker ── */}
        <aside className="w-full md:w-[260px] shrink-0 bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-5 md:sticky md:top-6">
          <NewOrderStepper
            steps={STEPS}
            activeStep={activeStep}
            completedSteps={completedSteps}
            disabledSteps={{ payment: !paymentUnlocked }}
            onStepClick={goToStep}
          />
        </aside>

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0 w-full bg-white dark:bg-(--dark-surface) rounded-[12px] border border-(--neutral-200) dark:border-(--dark-border) shadow-(--e1) p-6">
          {activeStep === "customer" && (
            <StepSection title="Customer Details" description="Find or add the walk-in customer">
              <div className="mt-4 max-w-xl">
                <label className="block font-dm text-[12px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-1.5">
                  Customer
                </label>
                <CustomerPicker
                  customers={customerOptions}
                  loading={customersLoading}
                  selectedCustomerId={selectedCustomerId}
                  onSelectCustomer={handleSelectCustomer}
                />
              </div>

              <div className="mt-5 max-w-xl flex flex-col gap-4">
                <div>
                  <label className="block font-dm text-[12px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Jane Wanjiru"
                    className="w-full font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) px-3 py-2.5 focus:outline-none focus:border-(--green-800) transition-colors placeholder:text-(--neutral-400)"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <PhoneInput label="Phone Number" value={customerPhone} onChange={setCustomerPhone} />
                  <div>
                    <label className="block font-dm text-[12px] font-semibold text-(--neutral-500) uppercase tracking-[0.6px] mb-1.5">
                      Email (optional)
                    </label>
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="jane@example.com"
                      className="w-full font-dm text-[14px] text-(--neutral-900) dark:text-(--dark-text) rounded-[8px] border border-(--neutral-200) dark:border-(--dark-border) bg-white dark:bg-(--dark-surface) px-3 py-2.5 focus:outline-none focus:border-(--green-800) transition-colors placeholder:text-(--neutral-400)"
                    />
                  </div>
                </div>
              </div>

              <StepFooter
                nextLabel="Continue to Products"
                nextDisabled={!customerComplete}
                onNext={() => goToStep("products")}
              />
            </StepSection>
          )}

          {activeStep === "products" && (
            <StepSection title="Products" description="Search the catalog and add items to the order">
              <div className="mt-4 flex flex-col lg:flex-row gap-6 items-start">
                {/* Left column — search + cart */}
                <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
                  <ProductPickerDropdown onAddProduct={handleAddProduct} />
                  <OrderCartList
                    items={cartItems}
                    onIncrement={handleIncrementItem}
                    onDecrement={handleDecrementItem}
                    onRemove={handleRemoveItem}
                  />
                </div>

                {/* Right column — order summary */}
                <div className="w-full lg:w-[320px] shrink-0">
                  <OrderSummary
                    itemCount={itemCount}
                    subtotalKes={subtotalKes}
                    discountKes={discountKes}
                    totalKes={totalKes}
                    appliedCoupon={appliedCoupon?.code ?? null}
                    couponInput={couponInput}
                    onCouponInputChange={setCouponInput}
                    onApplyCoupon={handleApplyCoupon}
                    onRemoveCoupon={handleRemoveCoupon}
                    couponLoading={couponLoading}
                    couponError={couponError}
                  />
                </div>
              </div>

              <StepFooter
                backLabel="Back to Customer"
                onBack={() => goToStep("customer")}
                nextLabel="Continue to Payment"
                nextDisabled={!paymentUnlocked}
                onNext={() => goToStep("payment")}
              />
            </StepSection>
          )}

          {activeStep === "payment" && (
            <StepSection title="Payment" description="Collect payment from the customer to complete the order">
              <PaymentStep
                cartItems={cartItems}
                totalKes={totalKes}
                appliedCoupon={appliedCoupon}
                customerName={customerName}
                customerPhone={customerPhone}
                customerEmail={customerEmail}
                selectedCustomerId={selectedCustomerId}
              />

              <StepFooter backLabel="Back to Products" onBack={() => goToStep("products")} />
            </StepSection>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local presentational helpers
// ---------------------------------------------------------------------------
function StepSection({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div>
      <h2 className="font-syne text-[18px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">{title}</h2>
      <p className="font-dm text-[13px] text-(--neutral-500) dark:text-(--dark-muted) mt-1">{description}</p>
      {children}
    </div>
  );
}

function StepFooter({
  backLabel,
  onBack,
  nextLabel,
  nextDisabled,
  onNext,
}: {
  backLabel?: string;
  onBack?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  onNext?: () => void;
}) {
  if (!onBack && !onNext) return null;
  return (
    <div className="mt-8 pt-5 border-t border-(--neutral-200) dark:border-(--dark-border) flex items-center justify-between">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="h-9 px-4 rounded-[8px] border border-(--neutral-200) font-dm text-[13px] text-(--neutral-700) hover:bg-(--neutral-50) transition-colors"
        >
          {backLabel ?? "Back"}
        </button>
      ) : (
        <span />
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="h-9 px-5 rounded-[8px] bg-(--green-800) font-dm text-[13px] font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {nextLabel ?? "Continue"}
        </button>
      )}
    </div>
  );
}
