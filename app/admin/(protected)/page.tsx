import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui/spinner";

const AdminDashboardClient = dynamic(
  () => import("@/components/admin/AdminDashboardClient").then((m) => m.AdminDashboardClient),
  { loading: () => <Spinner /> }
);

export const metadata = { title: "Dashboard | Fechi Organics Admin" };

export default function AdminPage() {
  return <AdminDashboardClient />;
}
