"use client";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Convertit une saisie française (« 1 234,56 ») en centimes ; `null` si invalide. */
export function parseEuroInput(text: string): number | null {
  const cleaned = text.replace(/\s| |€/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-") return null;
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Champ monétaire : affiche des euros, expose des centimes entiers. */
export const MoneyInput = React.forwardRef<HTMLInputElement, { value: number | null | undefined; onChange: (cents: number) => void; allowNegative?: boolean; className?: string; id?: string; "aria-invalid"?: boolean; "aria-label"?: string; disabled?: boolean; onBlur?: () => void; name?: string }>(
  ({ value, onChange, allowNegative, className, onBlur, ...props }, ref) => {
    const [text, setText] = React.useState(centsToInput(value));
    const last = React.useRef(value);
    React.useEffect(() => {
      if (value !== last.current) {
        last.current = value;
        setText(centsToInput(value));
      }
    }, [value]);
    return (
      <div className={cn("relative", className)}>
        <Input
          ref={ref}
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const cents = parseEuroInput(e.target.value);
            if (cents !== null && (allowNegative || cents >= 0)) {
              last.current = cents;
              onChange(cents);
            } else if (e.target.value.trim() === "") {
              last.current = 0;
              onChange(0);
            } else {
              last.current = Number.NaN;
              onChange(Number.NaN);
            }
          }}
          onBlur={() => {
            const cents = parseEuroInput(text);
            if (cents !== null) setText(centsToInput(cents));
            onBlur?.();
          }}
          className="pr-7 text-right tabular"
          {...props}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-subtle">€</span>
      </div>
    );
  },
);
MoneyInput.displayName = "MoneyInput";
