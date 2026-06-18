import { redirect } from "next/navigation";

// Contacts now lives under /admin/customers/tickets
export default function ContactsRedirect() {
  redirect("/admin/customers/tickets");
}
