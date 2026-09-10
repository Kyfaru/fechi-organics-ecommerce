import { db } from "@/lib/db";

export type VariantInput = { label: string; imageObjectKey?: string | null };

/**
 * Replaces all productVariant rows for a product. Variants reference an
 * image by objectKey (not id) because the image-save path
 * (app/api/admin/products/[id]/route.ts, lib/approval-executors.ts)
 * delete-and-recreates every productImage row on each save, so ids aren't
 * stable across saves — objectKeys are. Must be called AFTER the product's
 * images have been (re)created in the same save.
 */
export async function syncProductVariants(productId: string, variants: VariantInput[] | undefined): Promise<void> {
  if (variants === undefined) return;

  await db.productVariant.deleteMany({ where: { productId } });
  if (variants.length === 0) return;

  const objectKeys = variants
    .map((v) => v.imageObjectKey)
    .filter((k): k is string => Boolean(k));
  const images = objectKeys.length
    ? await db.productImage.findMany({
        where: { productId, objectKey: { in: objectKeys } },
        select: { id: true, objectKey: true },
      })
    : [];
  const imageIdByKey = new Map(images.map((i) => [i.objectKey, i.id]));

  await db.productVariant.createMany({
    data: variants.map((v, idx) => ({
      productId,
      label: v.label,
      imageId: v.imageObjectKey ? imageIdByKey.get(v.imageObjectKey) ?? null : null,
      sortOrder: idx,
    })),
  });
}
