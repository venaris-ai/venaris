// src/components/LogoutButton.tsx #2
"use client";

type Props = {
  className?: string;
  label?: string;
};

export default function LogoutButton({
  className = "rounded-md border px-3 py-1 text-sm hover:bg-gray-100",
  label = "Logout",
}: Props) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <button onClick={logout} className={className}>
      {label}
    </button>
  );
}