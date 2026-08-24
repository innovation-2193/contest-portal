"use client";

import { useEffect, useState } from "react";

export function ParticipantBulkSelection({ formId }: { formId: string }) {
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    const selectAll = form.querySelector<HTMLInputElement>("[data-participant-select-all]");
    if (!selectAll) return;

    const getRows = () => [...form.querySelectorAll<HTMLInputElement>("[data-participant-checkbox]")];
    const sync = () => {
      const rows = getRows();
      const checked = rows.filter((row) => row.checked).length;
      setSelectedCount(checked);
      selectAll.checked = rows.length > 0 && checked === rows.length;
      selectAll.indeterminate = checked > 0 && checked < rows.length;
      selectAll.disabled = rows.length === 0;
    };
    const handleSelectAll = () => {
      for (const row of getRows()) row.checked = selectAll.checked;
      sync();
    };

    form.addEventListener("change", sync);
    selectAll.addEventListener("change", handleSelectAll);
    sync();
    return () => {
      form.removeEventListener("change", sync);
      selectAll.removeEventListener("change", handleSelectAll);
    };
  }, [formId]);

  return <label className="bulk-select-all">
    <input type="checkbox" data-participant-select-all aria-label="เลือกผู้เข้าร่วมงานทั้งหมดในหน้านี้" />
    <span>เลือกทั้งหมดในหน้านี้</span>
    <b>{selectedCount ? `เลือกแล้ว ${selectedCount.toLocaleString("th-TH")} รายการ` : "ยังไม่ได้เลือกรายการ"}</b>
  </label>;
}
