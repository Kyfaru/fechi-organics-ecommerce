"use client";

interface Option {
  value: string;
  label: string;
}

interface PrelineSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function PrelineSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  className = "",
}: PrelineSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={[
        "py-2 px-3 pe-9 block w-full border border-[#c8d7c3] rounded-lg text-sm",
        "text-[#40493c] bg-white",
        "focus:border-[#27731e] focus:ring-1 focus:ring-[#27731e] focus:outline-none",
        "dark:bg-gray-900 dark:border-gray-700 dark:text-gray-300",
        "appearance-none cursor-pointer",
        className,
      ].join(" ")}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
