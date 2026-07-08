-- AlterTable
ALTER TABLE "testimonial" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

