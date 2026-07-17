import { redirect } from "next/navigation";

/** Legacy route: recurring payments moved into Send (/pay), auto-buys into
 *  Swap (/dashboard/swap) when the standalone Automations page was folded in. */
export default function StrategiesRedirect() {
  redirect("/pay");
}
