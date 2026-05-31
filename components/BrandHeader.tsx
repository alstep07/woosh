import Image from "next/image";
import Link from "next/link";

interface Props {
  rightSlot?: React.ReactNode;
}

export default function BrandHeader({ rightSlot }: Props) {
  return (
    <nav className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto">
      <Link href="/" className="flex items-center gap-2.5">
        <Image
          src="/woosh_logo.png"
          alt="Woosh"
          width={36}
          height={36}
          className="rounded-md"
          priority
        />
        <span className="text-xl font-bold tracking-tight">woosh</span>
      </Link>
      {rightSlot && <div className="flex items-center gap-3">{rightSlot}</div>}
    </nav>
  );
}
