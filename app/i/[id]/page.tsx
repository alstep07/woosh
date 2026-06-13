import { getInvoice } from "@/entities/invoice/lib/readInvoice";
import { lookupAddressSlug } from "@/entities/slug/lib/lookupAddressSlug";
import { PayPage } from "@/views/pay/ui/PayPage";

interface Props {
  params: { id: string };
}

// Invoice pay page. The URL carries only the invoice id — amount, memo and payee are
// read from the contract, and the recipient label is resolved from the payee, so there
// is no recipient name in the link to tamper with or misread.
export default async function Page({ params }: Props) {
  const id = params.id;
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
    return <PayPage slug="" address={null} />;
  }

  const invoice = await getInvoice(id as `0x${string}`);
  const recipientSlug = invoice ? await lookupAddressSlug(invoice.payee) : null;

  return (
    <PayPage
      slug={recipientSlug ?? invoice?.payee ?? ""}
      address={invoice ? invoice.payee : null}
      requestId={invoice?.id}
      initialAmount={invoice?.amount}
      memo={invoice?.memo}
      alreadyPaid={invoice?.paid}
      recipientSlug={recipientSlug ?? undefined}
    />
  );
}
