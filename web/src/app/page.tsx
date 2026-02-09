import { redirect } from "next/navigation";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function RootPage() {
  redirect(`/budgets/${getCurrentMonth()}`);
}
