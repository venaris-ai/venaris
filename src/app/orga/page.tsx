// src/app/orga/page.tsx
import Link from "next/link";

const items = [
  {
    href: "/orga/revier",
    title: "Revier",
    text: "Reviere, Flächenkontext und organisatorische Zuordnung.",
  },
  {
    href: "/orga/members",
    title: "Members",
    text: "Mitglieder, Rollen und Zugriffsstruktur der Organization.",
  },
  {
    href: "/orga/subscription",
    title: "Subscription",
    text: "Plan, Nutzung und spätere Abrechnung.",
  },
];

export default function OrgaPage() {
  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Orga</h1>
        <p className="text-sm text-gray-600">
          Tenant-Struktur, Mitglieder und organisatorische Einstellungen.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border bg-white p-6 transition hover:bg-gray-50"
          >
            <div className="text-lg font-medium">{item.title}</div>
            <div className="mt-2 text-sm text-gray-600">{item.text}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}