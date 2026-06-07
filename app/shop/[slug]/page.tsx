import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getProductBySlug } from "@/lib/queries/products";
import { SkeletonProductPage } from "@/components/ui/skeleton";
import { ProductDetailClient } from "@/components/storefront/ProductDetailClient";

// ---------------------------------------------------------------------------
// Metadata — used by Next.js for <title> and <meta description>
// ---------------------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  return {
    title: product
      ? `${product.name} | Fechi Organics`
      : "Product Not Found | Fechi Organics",
    description: product?.shortDescription ?? "",
  };
}

// ---------------------------------------------------------------------------
// Page — server component, no "use client"
// ---------------------------------------------------------------------------
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  // Triggers Next.js 404 page if slug doesn't match any active product
  if (!product) notFound();

  return (
    <main className="min-h-screen bg-white overflow-x-hidden">
      <Navbar />

      {/*
       * Suspense boundary: shows SkeletonProductPage while ProductDetailClient
       * (and any nested async work) resolves on first load.
       */}
      <Suspense
        fallback={
          <div className="px-4 md:px-8 py-12">
            <SkeletonProductPage />
          </div>
        }
      >
        <ProductDetailClient product={product} />
      </Suspense>

      <Footer />
    </main>
  );
}
