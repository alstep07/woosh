import { resolveSlug } from "@/entities/slug/lib/resolveSlug";
import { PayPage } from "@/views/pay/ui/PayPage";

interface Props {
  params: { slug: string };
}

export default async function Page({ params }: Props) {
  const address = await resolveSlug(params.slug);
  return <PayPage address={address} slug={params.slug} />;
}
