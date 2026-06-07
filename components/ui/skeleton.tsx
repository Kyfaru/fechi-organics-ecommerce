import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Base skeleton block
// ---------------------------------------------------------------------------
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md',
        className,
      )}
      style={{ backgroundColor: '#e8fce3' }}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Stacked text lines
// ---------------------------------------------------------------------------
interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4 rounded', i === lines - 1 ? 'w-[60%]' : 'w-full')}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image placeholder with shimmer
// ---------------------------------------------------------------------------
interface SkeletonImageProps {
  className?: string;
  aspectRatio?: string;
}

export function SkeletonImage({ className, aspectRatio = '1/1' }: SkeletonImageProps) {
  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-xl', className)}
      style={{ aspectRatio }}
    >
      {/* Base */}
      <div className="absolute inset-0 animate-pulse" style={{ backgroundColor: '#e8fce3' }} />
      {/* Shimmer sweep */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(164,246,144,0.4) 50%, transparent 100%)',
          animation: 'shimmer 1.6s infinite',
        }}
      />
      <style>{`
        @keyframes shimmer {
          0%  { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product card skeleton
// ---------------------------------------------------------------------------
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 p-3 rounded-2xl bg-white', className)}>
      {/* Image */}
      <SkeletonImage aspectRatio="1/1" className="rounded-xl" />
      {/* Title lines */}
      <div className="flex flex-col gap-2 px-1">
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-3/4 rounded" />
      </div>
      {/* Price */}
      <Skeleton className="h-5 w-1/3 rounded mx-1" />
      {/* Button placeholder */}
      <Skeleton className="h-9 w-full rounded-full mt-1" style={{ backgroundColor: '#a4f690' }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full product detail page skeleton
// ---------------------------------------------------------------------------
export function SkeletonProductPage({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col lg:flex-row gap-8 p-6 max-w-5xl mx-auto', className)}>
      {/* Left — large image */}
      <div className="w-full lg:w-1/2">
        <SkeletonImage aspectRatio="1/1" className="rounded-2xl" />
      </div>

      {/* Right — product details */}
      <div className="w-full lg:w-1/2 flex flex-col gap-4">
        {/* Title */}
        <Skeleton className="h-8 w-3/4 rounded" />
        {/* Price */}
        <Skeleton className="h-7 w-1/4 rounded" />
        {/* Description */}
        <SkeletonText lines={4} />
        {/* Button */}
        <Skeleton className="h-12 w-full rounded-full mt-4" style={{ backgroundColor: '#a4f690' }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shop grid skeleton
// ---------------------------------------------------------------------------
interface SkeletonShopGridProps {
  count?: number;
  className?: string;
}

export function SkeletonShopGrid({ count = 8, className }: SkeletonShopGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4',
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
