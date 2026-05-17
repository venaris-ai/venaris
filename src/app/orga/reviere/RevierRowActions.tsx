// src/app/orga/reviere/RevierRowActions.tsx #9
"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { AppLanguage } from "@/lib/i18n";

function t(language: AppLanguage) {
  return language === "en"
    ? {
        edit: "Edit ground",
        delete: "Delete ground permanently",
        confirmDeleteTitle: "Delete ground?",
        confirmDeleteText:
          "Are you sure you want to delete this ground permanently?",
        cancel: "Cancel",
        confirmDelete: "Delete",
        demoTitle: "Demo mode",
        demoText:
          "This is a demo account. Records cannot be removed, added, or changed.",
        understood: "Understood",
        defaultDeleteBlocked: "Default ground cannot be deleted",
      }
    : {
        edit: "Revier bearbeiten",
        delete: "Revier dauerhaft löschen",
        confirmDeleteTitle: "Revier löschen?",
        confirmDeleteText:
          "Sind Sie sicher, dass Sie dieses Revier dauerhaft löschen möchten?",
        cancel: "Abbrechen",
        confirmDelete: "Löschen",
        demoTitle: "Demo-Modus",
        demoText:
          "Das ist ein Demo-Account. Datensätze können weder entfernt noch hinzugefügt oder geändert werden.",
        understood: "Verstanden",
        defaultDeleteBlocked: "Default-Revier nicht löschbar",
      };
}

function EditIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export default function RevierRowActions({
  revierId,
  editHref,
  canDelete,
  deleteAction,
  isDemo = false,
  language,
}: {
  revierId: string;
  editHref: string;
  canDelete: boolean;
  deleteAction: (formData: FormData) => void | Promise<void>;
  isDemo?: boolean;
  language: AppLanguage;
}) {
  const text = t(language);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isReadOnlyModalOpen, setIsReadOnlyModalOpen] = useState(false);

  return (
    <>
      <td className="whitespace-nowrap px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <Link
            href={editHref}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/5 text-white/72 hover:border-amber-300/20 hover:bg-amber-300/10 hover:text-amber-100"
            aria-label={text.edit}
            title={text.edit}
          >
            <EditIcon />
          </Link>

          {canDelete ? (
            <button
              type="button"
              onClick={() =>
                isDemo
                  ? setIsReadOnlyModalOpen(true)
                  : setIsDeleteConfirmOpen(true)
              }
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/5 text-white/72 hover:border-rose-300/20 hover:bg-rose-300/10 hover:text-rose-200"
              aria-label={text.delete}
              title={text.delete}
            >
              <TrashIcon />
            </button>
          ) : (
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/8 text-white/20"
              aria-label={text.defaultDeleteBlocked}
              title={text.defaultDeleteBlocked}
            >
              <TrashIcon />
            </span>
          )}
        </div>
      </td>

      {isDeleteConfirmOpen
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-md rounded-[20px] border border-white/10 bg-[#102018] p-6 shadow-2xl">
                <h3 className="text-lg font-semibold text-white">
                  {text.confirmDeleteTitle}
                </h3>
                <p className="mt-2 text-sm text-white/70">
                  {text.confirmDeleteText}
                </p>

                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsDeleteConfirmOpen(false)}
                    className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:bg-white/8 hover:text-white"
                  >
                    {text.cancel}
                  </button>

                  <form action={deleteAction}>
                    <input type="hidden" name="revier_id" value={revierId} />
                    <button
                      type="submit"
                      className="rounded-[10px] border border-rose-300/20 bg-rose-300/10 px-4 py-2 text-sm text-rose-100 hover:bg-rose-300/15"
                    >
                      {text.confirmDelete}
                    </button>
                  </form>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {isReadOnlyModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-md rounded-[20px] border border-white/10 bg-[#102018] p-6 shadow-2xl">
                <h3 className="text-lg font-semibold text-white">
                  {text.demoTitle}
                </h3>
                <p className="mt-2 text-sm text-white/70">{text.demoText}</p>

                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsReadOnlyModalOpen(false)}
                    className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:bg-white/8 hover:text-white"
                  >
                    {text.understood}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}