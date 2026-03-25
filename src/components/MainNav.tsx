// src/components/MainNav.tsx #2
import Link from "next/link";
import {
  MAIN_NAV_ITEMS,
  filterNavItemsByAccess,
  getOptionalAccessContext,
} from "@/lib/authz";

export default async function MainNav() {
  const { role, email } = await getOptionalAccessContext();

  const items = filterNavItemsByAccess({
    items: MAIN_NAV_ITEMS,
    role,
    email,
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="flex items-center gap-2 text-sm">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-md border px-3 py-1 bg-white text-black hover:bg-gray-100"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}