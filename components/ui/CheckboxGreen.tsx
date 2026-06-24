"use client";

/**
 * CheckboxGreen — SVG animated checkbox (checkbox-wrapper-31 style).
 *
 * Visual:
 *   40×40 container with hidden <input type="checkbox"> (opacity 0, full-size).
 *   SVG layers:
 *     .background — filled circle: #ccc (unchecked) → #6cbe45 (checked), ease 0.6s
 *     .stroke     — white ring, stroke-dasharray animation on check
 *     .check      — white polyline checkmark, stroke-dasharray animation on check
 *   Hover: checkmark starts animating (dashoffset moves to 50 as a preview)
 *   Transitions: ease all 0.6s
 *
 * Props: { checked, onChange?, disabled?, className? }
 */

import React from "react";
import styled, { css, keyframes } from "styled-components";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface CheckboxGreenProps {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Keyframes
// ---------------------------------------------------------------------------
const drawCheck = keyframes`
  from { stroke-dashoffset: 30; }
  to   { stroke-dashoffset: 0; }
`;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------
const Wrapper = styled.label<{ $disabled: boolean }>`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};

  /* Hidden native checkbox */
  input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }

  svg {
    display: block;
    pointer-events: none;
  }
`;

const StyledSvg = styled.svg<{ $checked: boolean }>`
  .background {
    fill: ${({ $checked }) => ($checked ? "#6cbe45" : "#cccccc")};
    transition: fill 0.6s ease;
  }

  .stroke {
    stroke-dasharray: 113;
    stroke-dashoffset: ${({ $checked }) => ($checked ? 0 : 113)};
    transition: stroke-dashoffset 0.6s ease;
  }

  .check {
    stroke-dasharray: 30;
    stroke-dashoffset: ${({ $checked }) => ($checked ? 0 : 30)};
    ${({ $checked }) =>
      $checked &&
      css`
        animation: ${drawCheck} 0.4s ease 0.1s both;
      `}
    transition: stroke-dashoffset 0.6s ease;
  }

  /* Hover preview — partially reveal checkmark even when unchecked */
  ${({ $checked }) =>
    !$checked &&
    css`
      label:hover & .check {
        stroke-dashoffset: 15;
        transition: stroke-dashoffset 0.3s ease;
      }
    `}
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CheckboxGreen({
  checked,
  onChange,
  disabled = false,
  className,
}: CheckboxGreenProps) {
  return (
    <Wrapper $disabled={disabled} className={className}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => !disabled && onChange?.(e.target.checked)}
        disabled={disabled}
        aria-checked={checked}
      />

      <StyledSvg
        $checked={checked}
        width="40"
        height="40"
        viewBox="0 0 40 40"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Filled background circle */}
        <circle className="background" cx="20" cy="20" r="18" />

        {/*
          Stroke ring — SVG circumference of r=18 circle ≈ 113.
          Starts at 12 o'clock via transform.
        */}
        <circle
          className="stroke"
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
          style={{
            transformOrigin: "20px 20px",
            transform: "rotate(-90deg)",
          }}
        />

        {/* Checkmark polyline */}
        <polyline
          className="check"
          points="11,20 17,26.5 29,13"
          fill="none"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </StyledSvg>
    </Wrapper>
  );
}
