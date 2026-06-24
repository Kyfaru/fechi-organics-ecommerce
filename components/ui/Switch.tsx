"use client";

/**
 * Switch — animated toggle using styled-components.
 *
 * Visual spec:
 *   Width: 46px, Height: 24px, Circle diameter: 18px
 *   Off → gray bg rgb(131,131,131), cross icon (6px, gray tint) visible inside circle
 *   On  → green bg rgb(0,218,80), checkmark (10px, green tint) visible inside circle
 *   Circle transitions with cubic-bezier(0.27, 0.2, 0.25, 1.51) over 0.2s
 *   Slider ::before creates a subtle horizontal highlight / "ripple line" across the track
 *
 * Props: { checked, onChange, disabled? }
 */

import React from "react";
import styled from "styled-components";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const EASE = "cubic-bezier(0.27, 0.2, 0.25, 1.51)";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

/**
 * Label is the outermost element — it's a <label> so the hidden input
 * inside receives click events and the switch is fully accessible.
 */
const SwitchLabel = styled.label<{ $disabled: boolean }>`
  position: relative;
  display: inline-block;
  width: 46px;
  height: 24px;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  flex-shrink: 0;

  /* Focus ring for keyboard nav — shown when inner input is focused */
  &:focus-within .sw-slider {
    outline: 2px solid rgb(0, 218, 80);
    outline-offset: 2px;
  }
`;

/** Visually-hidden accessible checkbox */
const HiddenInput = styled.input`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: inherit;
  z-index: 1;
`;

/** The pill-shaped colored track */
const Slider = styled.span<{ $checked: boolean; $disabled: boolean }>`
  position: absolute;
  inset: 0;
  border-radius: 12px;
  background: ${({ $checked }) =>
    $checked ? "rgb(0, 218, 80)" : "rgb(131, 131, 131)"};
  transition: background 0.2s ${EASE};
  pointer-events: none;
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};

  /* Subtle horizontal ripple / highlight line */
  &::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 5px;
    right: 5px;
    height: 2px;
    border-radius: 1px;
    background: rgba(255, 255, 255, 0.22);
    transform: translateY(-50%);
  }
`;

/** White circle thumb */
const Thumb = styled.span<{ $checked: boolean }>`
  position: absolute;
  top: 3px;
  left: ${({ $checked }) => ($checked ? "25px" : "3px")};
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: left 0.2s ${EASE};
`;

// ---------------------------------------------------------------------------
// Inline SVG icons — rendered inside the thumb
// ---------------------------------------------------------------------------

/** White cross icon, 6×6 */
function CrossIcon() {
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" fill="none" aria-hidden="true">
      <line x1="0.75" y1="0.75" x2="5.25" y2="5.25" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="5.25" y1="0.75" x2="0.75" y2="5.25" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** White checkmark, 10×7 */
function CheckmarkIcon() {
  return (
    <svg width="10" height="7" viewBox="0 0 10 7" fill="none" aria-hidden="true">
      <polyline
        points="1,3.5 3.8,6 9,1"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Switch({ checked, onChange, disabled = false }: SwitchProps) {
  return (
    <SwitchLabel $disabled={disabled}>
      <HiddenInput
        type="checkbox"
        checked={checked}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        disabled={disabled}
        aria-checked={checked}
      />
      <Slider $checked={checked} $disabled={disabled} className="sw-slider">
        <Thumb $checked={checked}>
          {checked ? <CheckmarkIcon /> : <CrossIcon />}
        </Thumb>
      </Slider>
    </SwitchLabel>
  );
}
