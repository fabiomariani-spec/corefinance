import { RouteSkeleton } from "@/components/ui/route-skeleton";

export default function Loading() {
  return <RouteSkeleton variant="grid" kpis={3} cards={6} />;
}
