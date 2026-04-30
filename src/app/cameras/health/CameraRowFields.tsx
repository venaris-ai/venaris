// src/app/cameras/health/CameraRowFields.tsx #7
"use client";

import { type AppLanguage } from "@/lib/i18n";

type CameraStatus = "active" | "disabled";

type Props = {
  cameraId: string;
  initialStatus: CameraStatus;
  canManage: boolean;
  returnRevier: string;
  saveAction: (formData: FormData) => void | Promise<void>;
  isDemo?: boolean;
  language: AppLanguage;
};

function t(language: AppLanguage) {
  if (language === "en") {
    return {
      active: "Active",
      disabled: "Disabled",
    };
  }

  return {
    active: "Aktiv",
    disabled: "Deaktiviert",
  };
}

export default function CameraRowFields({ initialStatus, language }: Props) {
  const text = t(language);
  const isActive = initialStatus === "active";

  return (
    <td className="px-6 py-4 whitespace-nowrap">
      <span
        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
          isActive
            ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
            : "border-white/10 bg-white/5 text-white/72"
        }`}
      >
        {isActive ? text.active : text.disabled}
      </span>
    </td>
  );
}
