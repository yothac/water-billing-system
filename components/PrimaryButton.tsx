import Link from "next/link";

type PrimaryButtonProps = {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  size?: "lg" | "md" | "sm";
  className?: string;
};

const sizeClasses = {
  lg: "px-6 py-5 text-lg",
  md: "px-6 py-4 text-base",
  sm: "px-5 py-3 text-sm",
};

const baseClasses =
  "flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 font-bold text-white shadow-xl shadow-blue-600/30 transition active:scale-[0.98] active:bg-blue-700";

export default function PrimaryButton({
  children,
  href,
  onClick,
  type = "button",
  size = "lg",
  className = "",
}: PrimaryButtonProps) {
  const classes = `${baseClasses} ${sizeClasses[size]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
