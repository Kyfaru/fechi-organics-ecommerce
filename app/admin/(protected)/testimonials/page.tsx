import { redirect } from "next/navigation";

// Testimonials moved to /admin/content/testimonials
export default function TestimonialsRedirect() {
  redirect("/admin/content/testimonials");
}
