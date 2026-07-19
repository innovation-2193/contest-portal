"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Trophy, X } from "lucide-react";

type ScoreSubmitConfirmButtonProps = {
  children: ReactNode;
  className?: string;
  confirmTitle: string;
  confirmMessage: string;
};

export function ScoreSubmitConfirmButton({
  children,
  className,
  confirmTitle,
  confirmMessage,
}: ScoreSubmitConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  const confirmedRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (confirmedRef.current) {
      confirmedRef.current = false;
      return;
    }

    const form = event.currentTarget.form;
    if (form && !form.reportValidity()) return;
    event.preventDefault();
    setOpen(true);
  }

  function confirmSubmit() {
    confirmedRef.current = true;
    setOpen(false);
    buttonRef.current?.form?.requestSubmit(buttonRef.current);
  }

  return (
    <>
      <button ref={buttonRef} className={className} type="submit" onClick={handleClick}>
        {children}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="admin-score-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="score-confirm-title">
          <div className="admin-score-confirm-panel">
            <button className="modal-close" type="button" aria-label="ปิด" onClick={() => setOpen(false)}><X /></button>
            <AlertTriangle />
            <h3 id="score-confirm-title">{confirmTitle}</h3>
            <p>{confirmMessage}</p>
            <div className="admin-score-confirm-actions">
              <button className="secondary" type="button" onClick={() => setOpen(false)}>ยกเลิก</button>
              <button className="primary" type="button" onClick={confirmSubmit}><Trophy />ยืนยันบันทึกคะแนน</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
