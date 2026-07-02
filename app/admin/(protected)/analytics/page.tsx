import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui/spinner";

const AdminAnalyticsClient = dynamic(
  () => import("@/components/admin/AdminAnalyticsClient").then((m) => m.AdminAnalyticsClient),
  { loading: () => <Spinner /> }
);

export const metadata = { title: "Analytics | Fechi Organics Admin" };

export default function AnalyticsPage() {
  return <AdminAnalyticsClient />;
}
