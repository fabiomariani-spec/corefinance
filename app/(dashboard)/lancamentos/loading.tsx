import { RouteSkeleton } from "@/components/ui/route-skeleton";

export default function Loading() {
  return <RouteSkeleton variant="table" kpis={4} filters={5} rows={10} />;
}
