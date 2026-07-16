import { redirect } from "next/navigation";

/** Legacy route: the page moved when Strategies became Automations. */
export default function StrategiesRedirect() {
  redirect("/dashboard/automations");
}
