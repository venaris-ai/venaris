// src/components/MainNav.tsx #5
import Link from "next/link";
import {
  filterNavItemsByAccess,
  getMainNavItems,
  getOptionalAccessContext,
  type AppLanguage,
} from "@/lib/authz";

export default async function MainNav({
  language,
}: {
  language: AppLanguage;
}) {
  const { role, email, isDemo } = await getOptionalAccessContext();

  const items = filterNavItemsByAccess({
    items: getMainNavItems(language),
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