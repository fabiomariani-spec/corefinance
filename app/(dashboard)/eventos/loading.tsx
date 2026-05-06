import { RouteSkeleton } from "@/components/ui/route-skeleton";

export default function Loading() {
  return <RouteSkeleton variant="grid" kpis={4} cards={6} />;
}
