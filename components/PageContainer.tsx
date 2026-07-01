"use client";

import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

type PageContainerProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  variant?: "home" | "page";
  children: React.ReactNode;
  mainClassName?: string;
};

export default function PageContainer({
  title,
  subtitle,
  showBack = false,
  variant = "page",
  children,
  mainClassName = "py-5",
}: PageContainerProps) {
  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <AppHeader
        title={title}
        subtitle={subtitle}
        showBack={showBack}
        variant={variant}
      />
      <main
        className={`mx-auto w-full max-w-lg flex-1 px-4 pb-28 ${mainClassName}`}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
