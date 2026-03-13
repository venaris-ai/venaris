// src/components/MainNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home" },
  { href: "/wildlife", label: "Wildlife" },
  { href: "/cameras", label: "Cameras" },
  { href: "/orga", label: "Orga" },
];

export default function MainNav() {
  const pathname = usePathname();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <nav className="flex items-center gap-2 text-sm">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md border px-3 py-1 ${
              active
                ? "border-black bg-black text-white"
                : "bg-white text-black hover:bg-gray-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}

      <div className="ml-2 border-l pl-2">
        <button
          onClick={logout}
          className="rounded-md border px-3 py-1 hover:bg-gray-100"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}