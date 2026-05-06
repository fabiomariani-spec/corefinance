import { RouteSkeleton } from "@/components/ui/route-skeleton";

export default function Loading() {
  return <RouteSkeleton variant="table" kpis={0} rows={4} />;
}
