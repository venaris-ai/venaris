// src/app/orga/page.tsx #9
import { redirect } from "next/navigation";

export default async function OrgaPage() {
  redirect("/orga/account");
}