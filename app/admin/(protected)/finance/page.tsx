import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui/spinner";

const AdminTransactionsClient = dynamic(
  () => import("@/components/admin/AdminTransactionsClient").then((m) => m.AdminTransactionsClient),
  { loading: () => <Spinner /> }
);

export const metadata = { title: "Finance | Fechi Organics Admin" };

export default function FinancePage() {
  return <AdminTransactionsClient />;
}
