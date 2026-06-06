import { resolveSlug } from "@/entities/slug/lib/resolveSlug";
import { PayPage } from "@/views/pay/ui/PayPage";

interface Props {
  params: { slug: string };
  searchParams?: { amount?: string };
}

export default async function Page({ params, searchParams }: Props) {
  const address = await resolveSlug(params.slug);
  return (
    <PayPage
      address={address}
      slug={params.slug}
      initialAmount={searchParams?.amount}
    />
  );
}
