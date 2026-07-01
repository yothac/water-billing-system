import Link from "next/link";

type MenuCardProps = {
  label: string;
  href: string;
  icon: React.ReactNode;
  featured?: boolean;
};

export default function MenuCard({ label, href, icon, featured = false }: MenuCardProps) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 shadow-sm transition active:scale-[0.97] active:bg-blue-50 ${
        featured
          ? "col-span-3 flex-row justify-center gap-3 border-blue-200 bg-blue-50 py-5"
          : "border-slate-100"
      }`}
    >
      <span className={featured ? "text-blue-600" : "text-blue-500"}>{icon}</span>
      <span
        className={`text-center text-sm font-medium leading-snug ${
          featured ? "text-base text-blue-800" : "text-slate-700"
        }`}
      >
        {label}
      </span>
    </Link>
  );
}
