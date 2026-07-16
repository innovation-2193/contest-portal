"use client";

import { Printer } from "lucide-react";

export function AdminPrintButton({ label = "พิมพ์ข้อมูล" }: { label?: string }) {
  return <button className="primary print-hidden" type="button" onClick={() => window.print()}><Printer />{label}</button>;
}
