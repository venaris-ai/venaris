// src/components/MainNav.tsx #4
import Link from "next/link";
import {
  MAIN_NAV_ITEMS,
  filterNavItemsByAccess,
  getOptionalAccessContext,
} from "@/lib/authz";

export default async function MainNav() {
  const { role, email, isDemo } = await getOptionalAccessContext();

  const items = filterNavItemsByAccess({
    items: MAIN_NAV_ITEMS,
    role,
    email,
    isDemo,
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
          className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-white/78 backdrop-blur-sm hover:border-amber-300/20 hover:bg-white/8 hover:text-white"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}