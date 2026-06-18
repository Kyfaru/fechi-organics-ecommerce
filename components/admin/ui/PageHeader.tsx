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
    <div className={`${goldWash ? "bg-[--gold-50] dark:bg-transparent" : ""} px-6 pt-6`}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 font-dm text-[12px] text-[--neutral-400] mb-2">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.href} className="flex items-center gap-1.5">
              {i > 0 && <span>›</span>}
              {i === breadcrumbs.length - 1
                ? <span className="text-[--neutral-700] dark:text-[--dark-text]">{crumb.label}</span>
                : <Link href={crumb.href} className="hover:text-[--neutral-600] transition-colors">{crumb.label}</Link>
              }
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-syne text-[28px] font-semibold text-[--neutral-900] dark:text-[--dark-text]">{title}</h1>
          {description && (
            <p className="font-dm text-[15px] text-[--neutral-500] dark:text-[--dark-muted] mt-1">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="border-t border-[--neutral-200] dark:border-[--dark-border] mt-4 mb-6" />
    </div>
  );
}
