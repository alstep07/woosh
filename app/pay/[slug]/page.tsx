import { resolveSlug } from "@/entities/slug/lib/resolveSlug";
import { getInvoice } from "@/entities/invoice/lib/readInvoice";
import { PayPage } from "@/views/pay/ui/PayPage";

interface Props {
  params: { slug: string };
  searchParams?: { amount?: string; req?: string };
}

export default async function Page({ params, searchParams }: Props) {
  const req = searchParams?.req;

  // On-chain payment request: read amount/memo/payee from the contract (authoritative).
  if (req && /^0x[0-9a-fA-F]{64}$/.test(req)) {
    const invoice = await getInvoice(req as `0x${string}`);
    return (
      <PayPage
        slug={params.slug}
        address={invoice ? invoice.payee : null}
        requestId={invoice?.id}
        initialAmount={invoice?.amount}
        memo={invoice?.memo}
        alreadyPaid={invoice?.paid}
      />
    );
  }

  // Plain link (optionally with a non-binding ?amount= prefill).
  const address = await resolveSlug(params.slug);
  return <PayPage address={address} slug={params.slug} initialAmount={searchParams?.amount} />;
}
