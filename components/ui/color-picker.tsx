"use client";

import { PALETTE } from "@/lib/palette";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  colors?: readonly string[];
  /** Tamanho do botão em Tailwind (w-6 h-6, w-7 h-7). Default: w-7 h-7 */
  size?: "sm" | "md";
}

export function ColorPicker({
  value,
  onChange,
  colors = PALETTE,
  size = "md",
}: ColorPickerProps) {
  const sizeClass = size === "sm" ? "w-6 h-6" : "w-7 h-7";
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className={cn(
            sizeClass,
            "rounded-full transition-transform",
            value === color && "scale-125 ring-2 ring-white ring-offset-2 ring-offset-zinc-900"
          )}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
          aria-label={`Selecionar cor ${color}`}
        />
      ))}
    </div>
  );
}
