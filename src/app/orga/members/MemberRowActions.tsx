// src/app/orga/members/MemberRowActions.tsx #6
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

function SaveIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v6h8V3" />
      <path d="M9 17h6" />
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

type MemberRole = "owner" | "admin" | "member" | "viewer";
type MemberStatus = "active" | "disabled";

type DirtyEventDetail = {
  userId: string;
  dirty: boolean;
};

export default function MemberRowActions({
  userId,
  canEditRole,
  canEditStatus,
  canEditLanguage,
  canRemove,
  removeAction,
  isDemo = false,
}: {
  userId: string;
  initialRole?: MemberRole;
  initialStatus?: MemberStatus;
  canEditRole: boolean;
  canEditStatus: boolean;
  canEditLanguage: boolean;
  canRemove: boolean;
  removeAction: (formData: FormData) => void | Promise<void>;
  isDemo?: boolean;
}) {
  const [isDirty, setIsDirty] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isReadOnlyModalOpen, setIsReadOnlyModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const formId = useMemo(() => `member-controls-${userId}`, [userId]);
  const canEverSave = canEditRole || canEditStatus || canEditLanguage;
  const canSave = canEverSave && isDirty;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<DirtyEventDetail>;
      if (customEvent.detail?.userId !== userId) return;
      setIsDirty(Boolean(customEvent.detail.dirty));
    };

    window.addEventListener("member-row-dirty-change", handler);
    return () => {
      window.removeEventListener("member-row-dirty-change", handler);
    };
  }, [userId]);

  return (
    <>
      <td className="px-6 py-4 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-2">
          {canSave ? (
            isDemo ? (
              <button
                type="button"
                onClick={() => setIsReadOnlyModalOpen(true)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-amber-300/20 bg-amber-300/10 text-amber-200 hover:bg-amber-300/15"
                aria-label="Änderungen speichern"
                title="Änderungen speichern"
              >
                <SaveIcon />
              </button>
            ) : (
              <button
                type="submit"
                form={formId}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-amber-300/20 bg-amber-300/10 text-amber-200 hover:bg-amber-300/15"
                aria-label="Änderungen speichern"
                title="Änderungen speichern"
              >
                <SaveIcon />
              </button>
            )
          ) : (
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/8 text-white/20"
              aria-label="Änderungen speichern"
              title="Änderungen speichern"
            >
              <SaveIcon />
            </span>
          )}

          {canRemove ? (
            <>
              <button
                type="button"
                onClick={() =>
                  isDemo
                    ? setIsReadOnlyModalOpen(true)
                    : setIsDeleteConfirmOpen(true)
                }
                className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/5 text-white/72 hover:border-rose-300/20 hover:bg-rose-300/10 hover:text-rose-200"
                aria-label="Mitglied dauerhaft entfernen"
                title="Mitglied dauerhaft entfernen"
              >
                <TrashIcon />
              </button>

              {mounted && isDeleteConfirmOpen
                ? createPortal(
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                      <div className="w-full max-w-md rounded-[20px] border border-white/10 bg-[#102018] p-6 shadow-2xl">
                        <h3 className="text-lg font-semibold text-white">
                          Mitglied entfernen?
                        </h3>
                        <p className="mt-2 text-sm text-white/70">
                          Sind Sie sicher, dass Sie das Mitglied dauerhaft
                          entfernen möchten?
                        </p>

                        <div className="mt-5 flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setIsDeleteConfirmOpen(false)}
                            className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:bg-white/8 hover:text-white"
                          >
                            Abbrechen
                          </button>

                          <form action={removeAction}>
                            <input type="hidden" name="user_id" value={userId} />
                            <button
                              type="submit"
                              className="rounded-[10px] border border-rose-300/20 bg-rose-300/10 px-4 py-2 text-sm text-rose-100 hover:bg-rose-300/15"
                            >
                              Entfernen
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>,
                    document.body
                  )
                : null}

              {mounted && isReadOnlyModalOpen
                ? createPortal(
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                      <div className="w-full max-w-md rounded-[20px] border border-white/10 bg-[#102018] p-6 shadow-2xl">
                        <h3 className="text-lg font-semibold text-white">
                          Demo-Modus
                        </h3>
                        <p className="mt-2 text-sm text-white/70">
                          Das ist ein Demo-Account. Datensätze können weder
                          entfernt noch hinzugefügt oder geändert werden.
                        </p>

                        <div className="mt-5 flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setIsReadOnlyModalOpen(false)}
                            className="rounded-[10px] border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/78 hover:bg-white/8 hover:text-white"
                          >
                            Verstanden
                          </button>
                        </div>
                      </div>
                    </div>,
                    document.body
                  )
                : null}
            </>
          ) : (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/8 text-white/20">
              <TrashIcon />
            </span>
          )}
        </div>
      </td>
    </>
  );
}