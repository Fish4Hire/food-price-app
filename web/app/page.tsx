import { cacheLife } from "next/cache";
import { Dashboard } from "@/components/Dashboard";
import { getPriceData } from "@/lib/data";
import { buildDashboard } from "@/lib/model";

export default async function Home() {
  "use cache";
  cacheLife("hours");

  const model = buildDashboard(await getPriceData());
  return <Dashboard model={model} />;
}
