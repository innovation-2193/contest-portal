"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Eye, GripVertical, Save } from "lucide-react";
import type { EventBoothSource } from "../lib/event-booths";

type BoothOrderEditorProps = {
  sources: EventBoothSource[];
  saveAction: (formData: FormData) => void | Promise<void>;
  setCountAction: (formData: FormData) => void | Promise<void>;
};

export function BoothOrderEditor({ sources, saveAction, setCountAction }: BoothOrderEditorProps) {
  const [items, setItems] = useState(sources);
  const [draggedIdentity, setDraggedIdentity] = useState<string | null>(null);
  const [dragOverIdentity, setDragOverIdentity] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const identity = (source: EventBoothSource) => `${source.sourceType}:${source.sourceKey}`;
  const move = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) return;
    setItems((current) => {
      const next = current.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setDirty(true);
  };

  return <div className="booth-order-editor">
    <form className="booth-order-toolbar" action={saveAction} onSubmit={() => setSaving(true)}>
      <div>
        <strong>จัดตำแหน่งบูธ</strong>
        <span>ลากจากไอคอน ⋮⋮ เพื่อเรียงลำดับ หรือใช้ปุ่มขึ้น/ลงบนมือถือ แล้วกดบันทึก</span>
      </div>
      <div className="booth-order-actions">
        <span className={`booth-order-status ${dirty ? "is-dirty" : ""}`} aria-live="polite">{saving ? "กำลังบันทึก..." : dirty ? "มีการเปลี่ยนแปลงที่ยังไม่บันทึก" : "ลำดับปัจจุบัน"}</span>
        <input type="hidden" name="order" value={items.map(identity).join(",")} />
        <button className="primary" type="submit" disabled={!dirty || saving}><Save/>บันทึกลำดับ</button>
      </div>
    </form>
    <div className="booth-table-wrap">
      <table className="booth-management-table booth-order-table">
        <thead><tr><th>ลำดับ</th><th>ชื่อหน่วยงาน / แหล่งข้อมูล</th><th>จำนวนบูธ</th><th>รายการบูธ</th><th>ความครบถ้วน</th></tr></thead>
        <tbody>
          {items.map((source, sourceIndex) => {
            const sourceIdentity = identity(source);
            const completed = source.booths.filter((booth) => booth.workTitle && booth.workType && booth.contactName).length;
            const rowIndex = sourceIndex;
            return <tr
              key={sourceIdentity}
              className={`${dragOverIdentity === sourceIdentity ? "is-drag-over" : ""} ${draggedIdentity === sourceIdentity ? "is-dragging" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setDragOverIdentity(sourceIdentity); }}
              onDrop={(event) => { event.preventDefault(); const from = items.findIndex((item) => identity(item) === (event.dataTransfer.getData("text/plain") || draggedIdentity)); move(from, rowIndex); setDraggedIdentity(null); setDragOverIdentity(null); }}
              onDragLeave={() => setDragOverIdentity(null)}
            >
              <td data-label="ลำดับ" className="booth-index"><div className="booth-order-index"><span>{(sourceIndex + 1).toLocaleString("th-TH")}</span><button type="button" className="booth-drag-handle" draggable aria-label={`ลากเพื่อย้าย ${source.organizationName}`} onDragStart={(event) => { setDraggedIdentity(sourceIdentity); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", sourceIdentity); }} onDragEnd={() => { setDraggedIdentity(null); setDragOverIdentity(null); }}><GripVertical/></button><span className="booth-mobile-move"><button type="button" aria-label="เลื่อนขึ้น" disabled={sourceIndex === 0} onClick={() => move(sourceIndex, sourceIndex - 1)}><ArrowUp/></button><button type="button" aria-label="เลื่อนลง" disabled={sourceIndex === items.length - 1} onClick={() => move(sourceIndex, sourceIndex + 1)}><ArrowDown/></button></span></div></td>
              <td data-label="ชื่อหน่วยงาน / แหล่งข้อมูล"><span className={`status-pill ${source.sourceType === "finalist" ? "attended" : "registered"}`}>{source.sourceType === "finalist" ? "ผ่านรอบแรก" : "Exhibitor"}</span><strong>{source.organizationName}</strong><small>{source.sourceType === "finalist" ? source.defaultWorkTitle : source.sourceLabel}</small></td>
              <td data-label="จำนวนบูธ"><form action={setCountAction} className="booth-count-form compact"><input type="hidden" name="sourceType" value={source.sourceType}/><input type="hidden" name="sourceKey" value={source.sourceKey}/><input aria-label={`จำนวนบูธของ ${source.organizationName}`} type="number" name="count" min="1" max="20" defaultValue={source.booths.length} required/><button className="secondary" type="submit">บันทึก</button></form></td>
              <td data-label="รายการบูธ"><div className="booth-row-links">{source.booths.map((booth) => <Link key={booth.id} href={`/admin/booths/${booth.id}`}><span>บูธ {booth.boothNumber.toLocaleString("th-TH")}</span><b>{booth.workTitle || "รอกรอกชื่อผลงาน"}</b><Eye/></Link>)}</div></td>
              <td data-label="ความครบถ้วน"><span className={`booth-completion ${completed === source.booths.length ? "complete" : "pending"}`}>{completed.toLocaleString("th-TH")} / {source.booths.length.toLocaleString("th-TH")} บูธ</span></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </div>;
}
