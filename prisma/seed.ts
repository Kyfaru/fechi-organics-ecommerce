import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Argon2id } from "oslo/password";
import dotenv from "dotenv";
import { encrypt } from "../lib/crypto";

dotenv.config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  console.log("🌱 Seeding Fechi Organics database...");

  // Categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { key: "FACE_CARE" },
      update: {},
      create: {
        key: "FACE_CARE",
        name: "Face Care",
        slug: "face-care",
        imageKey: "img/face care.jpg",
        sortOrder: 1,
      },
    }),
    prisma.category.upsert({
      where: { key: "BODY_CARE" },
      update: {},
      create: {
        key: "BODY_CARE",
        name: "Body Care",
        slug: "body-care",
        imageKey: "img/2149237797.jpg",
        sortOrder: 2,
      },
    }),
    prisma.category.upsert({
      where: { key: "HAIR_CARE" },
      update: {},
      create: {
        key: "HAIR_CARE",
        name: "Hair Care",
        slug: "hair-care",
        imageKey: "img/side-view-woman-with-afro-hairstyle.jpg",
        sortOrder: 3,
      },
    }),
    prisma.category.upsert({
      where: { key: "WELLNESS" },
      update: {},
      create: {
        key: "WELLNESS",
        name: "Wellness",
        slug: "wellness",
        imageKey: "img/tea-01-01.png",
        sortOrder: 4,
      },
    }),
    prisma.category.upsert({
      where: { key: "BABY_KIDS" },
      update: {},
      create: {
        key: "BABY_KIDS",
        name: "Baby & Kids",
        slug: "baby-kids",
        imageKey: "img/2149618883.jpg",
        sortOrder: 5,
      },
    }),
  ]);

  const [faceCare, bodyCare, hairCare, wellness, babyKids] = categories;
  console.log("✅ Categories seeded");

  // Products
  const products = [
    {
      name: "Cold Water Oil",
      slug: "cold-water-oil",
      description:
        "A lightweight, fast-absorbing oil crafted from cold-pressed botanicals. Strengthens roots and promotes healthy hair growth.",
      shortDescription: "Strengthens roots & promotes growth",
      categoryId: hairCare.id,
      priceKes: 600000, // KES 6,000
      compareAtPriceKes: 800000,
      variantLabel: "100ml • Organic",
      bestSeller: true,
      stock: 50,
      ratingAvg: 4.8,
      ratingCount: 124,
      imageKey: "img/omcover.png",
    },
    {
      name: "Natural Tummy Tea",
      slug: "natural-tummy-tea",
      description:
        "A refreshing herbal blend that soothes digestion, reduces bloating, and supports gut health with 100% organic ingredients.",
      shortDescription: "Refreshing tasty tea that also makes you glow",
      categoryId: wellness.id,
      priceKes: 175000, // KES 1,750
      variantLabel: "250g • Herbal Blend",
      bestSeller: true,
      stock: 80,
      ratingAvg: 4.9,
      ratingCount: 89,
      imageKey: "img/tea-01-01.png",
    },
    {
      name: "Radiance Serum",
      slug: "radiance-serum",
      description:
        "A concentrated brightening serum with Vitamin C and African botanicals. Brightens skin tone and reduces fine lines.",
      shortDescription: "Brightens skin tone & reduces fine lines",
      categoryId: faceCare.id,
      priceKes: 280000, // KES 2,800
      variantLabel: "30ml • Active Formula",
      bestSeller: true,
      stock: 35,
      ratingAvg: 4.7,
      ratingCount: 211,
      imageKey: "img/292.jpg",
    },
    {
      name: "Shea Body Butter",
      slug: "shea-body-butter",
      description:
        "Rich, deeply nourishing body butter made with unrefined shea and mango butter. Deep hydration for dry skin.",
      shortDescription: "Deep hydration for dry skin",
      categoryId: bodyCare.id,
      priceKes: 120000, // KES 1,200
      compareAtPriceKes: 180000,
      variantLabel: "200ml • Whipped",
      bestSeller: false,
      stock: 60,
      ratingAvg: 4.6,
      ratingCount: 77,
      imageKey: "img/decorative-background-image.png",
    },
    {
      name: "Gentle Cleanser",
      slug: "gentle-cleanser",
      description:
        "A mild, pH-balanced facial cleanser that removes impurities without stripping natural oils. Purifies without stripping.",
      shortDescription: "Purifies without stripping natural oils",
      categoryId: faceCare.id,
      priceKes: 185000, // KES 1,850
      variantLabel: "150ml • All Skin Types",
      bestSeller: false,
      stock: 45,
      ratingAvg: 4.5,
      ratingCount: 56,
      imageKey: "img/2149237797.jpg",
    },
    {
      name: "Soothing Balm",
      slug: "soothing-balm",
      description:
        "Gentle calendula and chamomile balm specially formulated for babies and sensitive skin. Soothes and protects delicate skin.",
      shortDescription: "Gentle care for sensitive skin",
      categoryId: babyKids.id,
      priceKes: 95000, // KES 950
      variantLabel: "50ml • Baby Safe",
      bestSeller: false,
      stock: 30,
      ratingAvg: 4.9,
      ratingCount: 43,
      imageKey: "img/2149618883.jpg",
    },
    {
      name: "Immunity Drops",
      slug: "immunity-drops",
      description:
        "A potent daily botanical supplement with elderberry, echinacea, and African ginger. Daily botanical boost.",
      shortDescription: "Daily botanical immunity boost",
      categoryId: wellness.id,
      priceKes: 320000, // KES 3,200
      variantLabel: "50ml • Liquid Extract",
      bestSeller: false,
      stock: 25,
      ratingAvg: 4.7,
      ratingCount: 38,
      imageKey: "img/tea-01-01.png",
    },
    {
      name: "Glow Face Cream",
      slug: "glow-face-cream",
      description:
        "A luxurious moisturising cream with baobab oil and hyaluronic acid for a radiant, plumped complexion.",
      shortDescription: "Radiant glow in every drop",
      categoryId: faceCare.id,
      priceKes: 245000,
      variantLabel: "50ml • Moisturising",
      bestSeller: true,
      stock: 40,
      ratingAvg: 4.8,
      ratingCount: 165,
      imageKey: "img/skin care.png",
    },
    {
      name: "Hair Growth Serum",
      slug: "hair-growth-serum",
      description:
        "A potent scalp serum with rosemary, castor oil and biotin complex to stimulate follicles and reduce breakage.",
      shortDescription: "Stimulates follicles, reduces breakage",
      categoryId: hairCare.id,
      priceKes: 195000,
      variantLabel: "60ml • Scalp Treatment",
      bestSeller: false,
      stock: 55,
      ratingAvg: 4.6,
      ratingCount: 92,
      imageKey: "img/omcover.png",
    },
    {
      name: "Body Glow Oil",
      slug: "body-glow-oil",
      description:
        "A shimmering, lightweight body oil infused with marula and jojoba that leaves skin luminous and hydrated.",
      shortDescription: "Luminous hydration all day",
      categoryId: bodyCare.id,
      priceKes: 155000,
      variantLabel: "100ml • Shimmer",
      bestSeller: false,
      stock: 48,
      ratingAvg: 4.7,
      ratingCount: 61,
      imageKey: "img/2149237797.jpg",
    },
    {
      name: "Kids Bubble Bath",
      slug: "kids-bubble-bath",
      description:
        "A gentle, tear-free bubble bath with oat milk and lavender, perfect for a calming bedtime routine.",
      shortDescription: "Tear-free & gentle for little ones",
      categoryId: babyKids.id,
      priceKes: 85000,
      variantLabel: "300ml • Tear-Free",
      bestSeller: false,
      stock: 70,
      ratingAvg: 4.8,
      ratingCount: 29,
      imageKey: "img/2149618883.jpg",
    },
    {
      name: "Exfoliating Scrub",
      slug: "exfoliating-scrub",
      description:
        "A fine sugar and sea salt scrub with African shea and papaya enzyme to reveal smooth, glowing skin.",
      shortDescription: "Reveals smooth, glowing skin",
      categoryId: faceCare.id,
      priceKes: 135000,
      compareAtPriceKes: 200000,
      variantLabel: "150g • Exfoliating",
      bestSeller: false,
      stock: 38,
      ratingAvg: 4.5,
      ratingCount: 47,
      imageKey: "img/face care.jpg",
    },
  ];

  for (const p of products) {
    const { imageKey, ...data } = p;
    const product = await prisma.product.upsert({
      where: { slug: data.slug },
      update: {},
      create: data,
    });

    await prisma.productImage.upsert({
      where: {
        // compound unique doesn't exist on productImage; use a find+create pattern
        id: `seed-${product.id}-primary`,
      },
      update: {},
      create: {
        id: `seed-${product.id}-primary`,
        productId: product.id,
        objectKey: imageKey,
        alt: data.name,
        sortOrder: 0,
        isPrimary: true,
      },
    });
  }

  console.log(`✅ ${products.length} products seeded`);

  // Testimonials
  await prisma.testimonial.upsert({
    where: { id: "seed-testimonial-1" },
    update: {},
    create: {
      id: "seed-testimonial-1",
      authorName: "Amina W.",
      location: "Nairobi, Kenya",
      quote:
        "After just 4 weeks of using the Glow Face Cream and Radiance Serum together, my skin texture has completely transformed. I get compliments every day now!",
      rating: 5,
      beforeKey: "img/face care.jpg",
      afterKey: "img/skin care.png",
      source: "manual",
      approved: true,
      sortOrder: 1,
    },
  });

  await prisma.testimonial.upsert({
    where: { id: "seed-testimonial-2" },
    update: {},
    create: {
      id: "seed-testimonial-2",
      authorName: "Fatima K.",
      location: "Mombasa, Kenya",
      quote:
        "The Cold Water Oil is absolutely incredible. My hair has grown so much and the breakage has reduced to almost nothing. Worth every shilling!",
      rating: 5,
      beforeKey: "img/side-view-woman-with-afro-hairstyle.jpg",
      afterKey: "img/side-view-woman-with-afro-hairstyle.png",
      source: "manual",
      approved: true,
      sortOrder: 2,
    },
  });

  await prisma.testimonial.upsert({
    where: { id: "seed-testimonial-3" },
    update: {},
    create: {
      id: "seed-testimonial-3",
      authorName: "Grace M.",
      location: "Eldoret, Kenya",
      quote:
        "I was sceptical at first but the Natural Tummy Tea has genuinely changed my life. Bloating gone, skin glowing. Fechi Organics is the real deal.",
      rating: 5,
      beforeKey: "img/2149618883.jpg",
      afterKey: "img/2149237797.jpg",
      source: "manual",
      approved: true,
      sortOrder: 3,
    },
  });

  console.log("✅ Testimonials seeded");

  // ---------------------------------------------------------------------------
  // Admin user — kyfarulabs@gmail.com
  // ---------------------------------------------------------------------------
  const adminEmail = "kyfarulabs@gmail.com";
  const adminPassword = "Kyfaru@2026";
  const hashedPassword = await new Argon2id().hash(adminPassword);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "admin", emailVerified: true, banned: false },
    create: {
      id: crypto.randomUUID(),
      name: "Jefferson Kimotho",
      email: adminEmail,
      emailVerified: true,
      role: "admin",
      twoFactorEnabled: false,
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await prisma.account.upsert({
    where: { id: `${adminUser.id}-credential` },
    update: { password: hashedPassword },
    create: {
      id: `${adminUser.id}-credential`,
      userId: adminUser.id,
      accountId: adminEmail,
      providerId: "credential",
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await prisma.adminProfile.upsert({
    where: { userId: adminUser.id },
    update: { fullName: "Jefferson Kimotho", isActive: true },
    create: {
      id: crypto.randomUUID(),
      userId: adminUser.id,
      fullName: "Jefferson Kimotho",
      permissions: {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  console.log(`✅ Admin account created/updated: ${adminEmail}`);

  // ---------------------------------------------------------------------------
  // Branches — stub records with placeholder encrypted credentials.
  // Replace consumerKeyEnc / consumerSecretEnc / passkeyEnc via the admin
  // panel or a direct DB update once real Daraja credentials are available.
  // ---------------------------------------------------------------------------
  const branchDefs = [
    {
      id: "branch-nairobi",
      name: "Nairobi Branch",
      county: "Nairobi",
      mpesaType: "PAYBILL" as const,
      shortcode: "000000",
    },
    {
      id: "branch-mombasa",
      name: "Mombasa Branch",
      county: "Mombasa",
      mpesaType: "PAYBILL" as const,
      shortcode: "000000",
    },
    {
      id: "branch-kisumu",
      name: "Kisumu Branch",
      county: "Kisumu",
      mpesaType: "TILL" as const,
      shortcode: "000000",
    },
    {
      id: "branch-nakuru",
      name: "Nakuru Branch",
      county: "Nakuru",
      mpesaType: "PAYBILL" as const,
      shortcode: "000000",
    },
    {
      id: "branch-eldoret",
      name: "Eldoret Branch",
      county: "Uasin Gishu",
      mpesaType: "PAYBILL" as const,
      shortcode: "000000",
    },
  ];

  for (const b of branchDefs) {
    await prisma.branch.upsert({
      where: { id: b.id },
      update: {},
      create: {
        id: b.id,
        name: b.name,
        county: b.county,
        mpesaType: b.mpesaType,
        shortcode: b.shortcode,
        consumerKeyEnc: encrypt("PLACEHOLDER"),
        consumerSecretEnc: encrypt("PLACEHOLDER"),
        passkeyEnc: encrypt("PLACEHOLDER"),
        isActive: true,
      },
    });
  }

  console.log(`✅ ${branchDefs.length} branches seeded`);

  console.log("🎉 Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
