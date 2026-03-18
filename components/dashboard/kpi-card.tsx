import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  variation?: {
    value: number;
    label: string;
    isPositive: boolean;
  };
  icon?: React.ReactNode;
  color?: "indigo" | "emerald" | "red" | "amber" | "violet";
  size?: "default" | "large";
}

const colorMap = {
  indigo: {
    icon: "bg-indigo-600/15 text-indigo-400",
    badge: "bg-indigo-600/10 text-indigo-400",
    border: "border-indigo-600/20",
  },
  emerald: {
    icon: "bg-emerald-600/15 text-emerald-400",
    badge: "bg-emerald-600/10 text-emerald-400",
    border: "border-emerald-600/20",
  },
  red: {
    icon: "bg-red-600/15 text-red-400",
    badge: "bg-red-600/10 text-red-400",
    border: "border-red-600/20",
  },
  amber: {
    icon: "bg-amber-600/15 text-amber-400",
    badge: "bg-amber-600/10 text-amber-400",
    border: "border-amber-600/20",
  },
  violet: {
    icon: "bg-violet-600/15 text-violet-400",
    badge: "bg-violet-600/10 text-violet-400",
    border: "border-violet-600/20",
  },
};

export function KpiCard({
  title,
  value,
  subtitle,
  variation,
  icon,
  color = "indigo",
  size = "default",
}: KpiCardProps) {
  const colors = colorMap[color];

  return (
    <div
      className={cn(
        "bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3 hover:border-zinc-700 transition-colors",
        size === "large" && "p-6"
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-zinc-400">{title}</p>
        {icon && (
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", colors.icon)}>
            {icon}
          </div>
        )}
      </div>

      <div>
        <p
          className={cn(
            "font-bold text-zinc-100 tracking-tight",
            size === "large" ? "text-3xl" : "text-2xl"
          )}
        >
          {value}
        </p>
        {subtitle && (
          <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>
        )}
      </div>

      {variation && (
        <div
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium w-fit",
            variation.isPositive
              ? "bg-emerald-600/10 text-emerald-400"
              : "bg-red-600/10 text-red-400"
          )}
        >
          {variation.value === 0 ? (
            <Minus className="w-3 h-3" />
          ) : variation.isPositive ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          <span>{variation.label} vs mês anterior</span>
        </div>
      )}
    </div>
  );
}
