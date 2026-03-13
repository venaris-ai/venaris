// src/app/wildlife/page.tsx
import Link from "next/link";

const items = [
  {
    href: "/wildlife/species",
    title: "Species",
    text: "Artenübersicht, häufigste Nachweise und erste Verteilung.",
  },
  {
    href: "/wildlife/where-when",
    title: "Where & When",
    text: "Wo und wann Wild sichtbar wird – nach Kamera, Ort und Zeitfenster.",
  },
  {
    href: "/wildlife/activity",
    title: "Activity",
    text: "Aktivitätsmuster im Tages- und Wochenverlauf.",
  },
];

export default function WildlifePage() {
  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Wildlife</h1>
        <p className="text-sm text-gray-600">
          Wildlife Intelligence, Aktivität und erste Muster im Revier.
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