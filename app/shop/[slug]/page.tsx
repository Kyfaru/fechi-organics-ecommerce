import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getProductBySlug } from "@/lib/queries/products";
import { SkeletonProductPage } from "@/components/ui/skeleton";
import { ProductDetailClient } from "@/components/storefront/ProductDetailClient";
import { SITE_URL } from "@/lib/site";

// ---------------------------------------------------------------------------
// Metadata — used by Next.js for <title>, <meta description>, OG/Twitter cards
// ---------------------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product Not Found" };

  const title = product.name;
  const description = product.shortDescription || product.description.slice(0, 160);

  return {
    title,
    description,
    alternates: { canonical: `/shop/${slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: product.primaryImageUrl }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [product.primaryImageUrl],
    },
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription || product.description,
    image: product.images.map((i) => i.url),
    brand: { "@type": "Brand", name: "Fechi Organics" },
    ...(product.ratingCount > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: product.ratingAvg,
        reviewCount: product.ratingCount,
      },
    }),
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/shop/${slug}`,
      priceCurrency: "KES",
      price: product.priceKes,
      availability: product.outOfStock
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
    },
  };

  return (
    <main className="min-h-screen bg-white dark:bg-gray-950 overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
