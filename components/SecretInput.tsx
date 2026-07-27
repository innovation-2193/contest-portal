"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type SecretInputProps = InputHTMLAttributes<HTMLInputElement> & {
  revealLabel?: string;
  hideLabel?: string;
};

export function SecretInput({
  className,
  revealLabel = "แสดงรหัส",
  hideLabel = "ซ่อนรหัส",
  type = "password",
  ...props
}: SecretInputProps) {
  const [revealed, setRevealed] = useState(false);

  return <span className="secret-input">
    <input {...props} className={className} type={revealed ? "text" : type}/>
    <button
      aria-label={revealed ? hideLabel : revealLabel}
      className="secret-input-toggle"
      title={revealed ? hideLabel : revealLabel}
      type="button"
      onClick={() => setRevealed((value) => !value)}
    >
      {revealed ? <EyeOff/> : <Eye/>}
    </button>
  </span>;
}
