import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/home/HeroSection";
import { CategoriesSection } from "@/components/home/CategoriesSection";
import { BestSellersSection } from "@/components/home/BestSellersSection";
import { InfoGridSection } from "@/components/home/InfoGridSection";
import { FaqSection } from "@/components/home/FaqSection";
import { BrandTrackSection } from "@/components/home/BrandTrackSection";
import { TestimonialsSection } from "@/components/home/TestimonialsSection";
import { getBestSellers } from "@/lib/queries/products";
import { getCategories } from "@/lib/queries/categories";
import { getTestimonials } from "@/lib/queries/testimonials";

export default async function HomePage() {
  const [bestSellers, categories, testimonials] = await Promise.all([
    getBestSellers(4),
    getCategories(),
    getTestimonials(),
  ]);

  return (
    <main className="min-h-screen bg-white dark:bg-gray-950 overflow-x-hidden">
      <Navbar />
      <HeroSection products={bestSellers} />
      <CategoriesSection categories={categories} />
      <BestSellersSection products={bestSellers} />
      <InfoGridSection />
      <FaqSection />
      <BrandTrackSection />
      <TestimonialsSection testimonials={testimonials} />
      <Footer />
    </main>
  );
}
