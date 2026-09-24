"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Guards a drawer/panel's close action behind a "discard changes?" prompt
 * whenever `form` has changed since the panel last opened. Re-snapshots on
 * every open, so it works for both "create" (blank form) and "edit"
 * (prefilled form) flows without the caller doing anything extra.
 */
export function useUnsavedChangesGuard<T>(form: T, open: boolean, onClose: () => void) {
  const snapshotRef = useRef(form);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (open) snapshotRef.current = form;
    // Only re-snapshot on open/close transitions, not on every form edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ponytail: JSON.stringify can't see File objects (Blob has no enumerable
  // props), so a form field holding a raw File won't register as dirty on
  // its own — fine here since every drawer's form stores uploaded images as
  // URL strings, not File objects. Revisit if that changes.
  const isDirty = JSON.stringify(form) !== JSON.stringify(snapshotRef.current);

  function requestClose() {
    if (isDirty) setConfirmOpen(true);
    else onClose();
  }

  function confirmDiscard() {
    setConfirmOpen(false);
    onClose();
  }

  return { requestClose, confirmOpen, setConfirmOpen, confirmDiscard };
}
