import Link from "next/link";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  variant?: "home" | "page";
};

export default function AppHeader({
  title,
  subtitle,
  showBack = false,
  variant = "page",
}: AppHeaderProps) {
  const isHome = variant === "home";

  return (
    <header
      className={`bg-gradient-to-br from-blue-700 via-blue-600 to-blue-800 px-4 text-white shadow-lg ${
        isHome ? "pb-8 pt-6" : "pb-6 pt-5"
      }`}
    >
      <div className="mx-auto max-w-lg">
        {showBack && (
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white transition active:bg-white/25"
          >
            ← กลับหน้าหลัก
          </Link>
        )}

        {isHome && (
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-blue-100">หมู่บ้านตัวอย่าง</p>
          </div>
        )}

        <h1 className="text-xl font-bold leading-snug tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && (
          <p className={`text-sm text-blue-100 sm:text-base ${isHome ? "mt-2" : "mt-1"}`}>
            {subtitle}
          </p>
        )}
      </div>
    </header>
  );
}
