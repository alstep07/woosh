import { resolveSlug } from "@/entities/slug/lib/resolveSlug";
import { lookupAddressSlug } from "@/entities/slug/lib/lookupAddressSlug";
import { getInvoice } from "@/entities/invoice/lib/readInvoice";
import { PayPage } from "@/views/pay/ui/PayPage";

interface Props {
  params: { slug: string };
  searchParams?: { amount?: string; req?: string };
}

export default async function Page({ params, searchParams }: Props) {
  const req = searchParams?.req;

  // On-chain payment request: read amount/memo/payee from the contract (authoritative).
  // The recipient label is derived from the contract payee — the slug in the URL is
  // cosmetic and ignored, so a tampered link can't even misrepresent who's being paid.
  if (req && /^0x[0-9a-fA-F]{64}$/.test(req)) {
    const invoice = await getInvoice(req as `0x${string}`);
    const recipientSlug = invoice ? await lookupAddressSlug(invoice.payee) : null;
    return (
      <PayPage
        slug={params.slug}
        address={invoice ? invoice.payee : null}
        requestId={invoice?.id}
        initialAmount={invoice?.amount}
        memo={invoice?.memo}
        alreadyPaid={invoice?.paid}
        recipientSlug={recipientSlug ?? undefined}
      />
    );
  }

  // Plain link (optionally with a non-binding ?amount= prefill). resolveSlug throws on
  // an RPC failure rather than returning null, so a transient network hiccup can be
  // told apart from "this slug really isn't registered" instead of showing the same
  // dead-end "Invalid payment link" for both.
  let address: `0x${string}` | null = null;
  let resolveError = false;
  try {
    address = await resolveSlug(params.slug);
  } catch {
    resolveError = true;
  }
  return (
    <PayPage
      address={address}
      slug={params.slug}
      initialAmount={searchParams?.amount}
      resolveError={resolveError}
    />
  );
}
