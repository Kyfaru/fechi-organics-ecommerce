import Link from "next/link";
import type { ReactNode } from "react";

interface Breadcrumb { label: string; href: string; }

interface PageHeaderProps {
  breadcrumbs?: Breadcrumb[];
  title: string;
  description?: string;
  action?: ReactNode;
  goldWash?: boolean;
}

export function PageHeader({ breadcrumbs, title, description, action, goldWash }: PageHeaderProps) {
  return (
    <div className={`${goldWash ? "bg-(--gold-50) dark:bg-(--dark-bg)" : ""} px-4 sm:px-6 pt-4 sm:pt-6`}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 font-dm text-[12px] text-(--green-600) dark:text-(--dark-muted) mb-2 overflow-x-auto whitespace-nowrap">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.href} className="flex items-center gap-1.5">
              {i > 0 && <span>›</span>}
              {i === breadcrumbs.length - 1
                ? <span className="text-(--neutral-700) dark:text-(--dark-text)">{crumb.label}</span>
                : <Link href={crumb.href} className="hover:text-(--green-900) dark:hover:text-(--dark-accent) transition-colors">{crumb.label}</Link>
              }
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-syne text-[22px] sm:text-[28px] font-semibold text-(--neutral-900) dark:text-(--dark-text)">{title}</h1>
          {description && (
            <p className="font-dm text-[13px] sm:text-[15px] text-(--neutral-500) dark:text-(--dark-muted) mt-1">{description}</p>
          )}
        </div>
        {action && (
          // Phones: header actions that carry an icon collapse to icon-only (text stays in the DOM for screen readers).
          <div className="shrink-0 flex flex-wrap items-center gap-2 max-sm:[&_:is(button,a):has(svg)]:text-[0px] max-sm:[&_:is(button,a):has(svg)]:gap-0 max-sm:[&_:is(button,a):has(svg)]:min-w-10 max-sm:[&_:is(button,a):has(svg)]:min-h-10 max-sm:[&_:is(button,a):has(svg)]:px-0 max-sm:[&_:is(button,a):has(svg)]:justify-center">
            {action}
          </div>
        )}
      </div>
      <div className="border-t border-(--neutral-200) dark:border-(--dark-border) mt-4 mb-4 sm:mb-6" />
    </div>
  );
}
