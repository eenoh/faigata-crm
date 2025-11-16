import Image from "next/image";

export function BrandLogo() {
  return (
    <div className="flex items-center gap-2">
      <Image
        src="/logo-faigata.svg"
        alt="Faigata"
        width={28}
        height={28}
      />
      <span className="font-semibold text-slate-900">Faigata</span>
    </div>
  );
}
