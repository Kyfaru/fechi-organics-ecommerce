// Auth is handled by app/admin/(protected)/layout.tsx — no guard needed here.
import { AdminTestimonialsClient } from "@/components/admin/AdminTestimonialsClient";

export const metadata = { title: "Testimonials | Fechi Organics Admin" };

export default function AdminTestimonialsPage() {
  return <AdminTestimonialsClient />;
}
