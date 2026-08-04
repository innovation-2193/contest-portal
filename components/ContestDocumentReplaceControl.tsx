"use client";

import { type FormEvent, useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2, XCircle } from "lucide-react";

const documentOptions = [
  { value: "ownership", label: "3.1 หลักฐานความเป็นเจ้าของผลงาน" },
  { value: "concept", label: "3.2 แบบสรุปผลงานโดยย่อ" },
  { value: "prototype", label: "3.3 หลักฐานต้นแบบหรือการทดลอง" },
  { value: "implementation", label: "3.4 แผนต่อยอดใช้งานจริง" },
];

type UploadState = {
  status: "idle" | "uploading" | "saved" | "error";
  message: string;
};

export function ContestDocumentReplaceControl({ submissionCode }: { submissionCode: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] = useState(documentOptions[0].value);
  const [fileName, setFileName] = useState("");
  const [state, setState] = useState<UploadState>({ status: "idle", message: "" });

  async function submitReplacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0] ?? null;
    if (!file) {
      setState({ status: "error", message: "กรุณาเลือกไฟล์ PDF" });
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    setState({ status: "uploading", message: "กำลังอัปโหลดไฟล์" });

    try {
      const response = await fetch(`/api/contest/submissions/${encodeURIComponent(submissionCode)}/files/${encodeURIComponent(documentType)}`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json().catch(() => ({ ok: false, message: "ไม่สามารถอ่านผลลัพธ์จากระบบได้" }));
      if (!response.ok || !result.ok) throw new Error(result.message ?? "อัปโหลดแทนที่ไฟล์ไม่สำเร็จ");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFileName("");
      setState({ status: "saved", message: result.message ?? "อัปโหลดแทนที่ไฟล์แล้ว" });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "อัปโหลดแทนที่ไฟล์ไม่สำเร็จ" });
    }
  }

  return <details className="contest-document-editor">
    <summary><FileUp/>แก้ไขไฟล์</summary>
    <form onSubmit={submitReplacement}>
      <label>
        <span>เอกสาร</span>
        <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} disabled={state.status === "uploading"}>
          {documentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="contest-document-file-picker">
        <span>ไฟล์ PDF ใหม่</span>
        <em>{fileName || "เลือกไฟล์ PDF"}</em>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          disabled={state.status === "uploading"}
          onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? "")}
        />
      </label>
      <button type="submit" disabled={state.status === "uploading"}>
        {state.status === "uploading" ? <Loader2 className="spin-icon"/> : <FileUp/>}
        อัปโหลดแทนที่
      </button>
      {state.message ? <p className={`contest-document-editor-message ${state.status}`}>
        {state.status === "uploading" ? <Loader2 className="spin-icon"/> : state.status === "error" ? <XCircle/> : <CheckCircle2/>}
        <span>{state.message}</span>
      </p> : null}
    </form>
  </details>;
}
