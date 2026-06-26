"use client";

interface PrelineDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  type?: "date" | "datetime-local";
}

export function PrelineDatePicker({
  value,
  onChange,
  placeholder,
  className = "",
  type = "date",
}: PrelineDatePickerProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={[
        "py-2 px-3 block w-full border border-[#c8d7c3] rounded-lg text-sm",
        "text-[#40493c] bg-white",
        "focus:border-[#27731e] focus:ring-1 focus:ring-[#27731e] focus:outline-none",
        "dark:bg-gray-900 dark:border-gray-700 dark:text-gray-300",
        "[color-scheme:light] dark:[color-scheme:dark]",
        className,
      ].join(" ")}
    />
  );
}
