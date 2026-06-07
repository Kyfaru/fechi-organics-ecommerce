import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ShopClient } from "@/components/shop/ShopClient";
import { getCategories } from "@/lib/queries/categories";

export const metadata = {
  title: "Shop All Products | Fechi Organics",
  description: "Browse our full range of natural skincare, haircare, wellness and baby products.",
};

export default async function ShopPage() {
  const categories = await getCategories();

  return (
    <main className="min-h-screen bg-white overflow-x-hidden">
      <Navbar />
      <ShopClient categories={categories} />
      <Footer />
    </main>
  );
}
