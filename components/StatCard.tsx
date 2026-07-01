type StatCardProps = {
  label: string;
  value: number;
  unit: string;
  color: string;
  className?: string;
};

export default function StatCard({ label, value, unit, color, className = "" }: StatCardProps) {
  return (
    <div className={`rounded-2xl border border-slate-100 bg-white p-4 shadow-sm ${className}`}>
      <div className={`mb-3 h-1 w-8 rounded-full ${color}`} />
      <p className="text-2xl font-bold text-slate-800">
        {value}
        <span className="ml-1 text-sm font-normal text-slate-500">{unit}</span>
      </p>
      <p className="mt-1 text-sm leading-snug text-slate-600">{label}</p>
    </div>
  );
}
