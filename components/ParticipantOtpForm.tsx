"use client";

import { useRef } from "react";
import { KeyRound, LogIn } from "lucide-react";

export function ParticipantOtpForm({ email }: { email: string }) {
  const submitting = useRef(false);

  function handleInput(event: React.FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const normalized = input.value
      .replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)))
      .replace(/\D/g, "")
      .slice(0, 6);
    input.value = normalized;
    if (normalized.length !== 6 || submitting.current) return;
    submitting.current = true;
    const form = input.form;
    requestAnimationFrame(() => form?.requestSubmit());
  }

  return <form action="/api/participant-auth/verify" method="post" className="participant-login-form">
    <input type="email" name="username" value={email} autoComplete="username" readOnly hidden/>
    <label>
      <KeyRound/>รหัส OTP 6 หลัก
      <input
        type="text"
        name="otp"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        autoComplete="one-time-code"
        enterKeyHint="done"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="กรอกรหัส 6 หลัก"
        aria-label="รหัส OTP 6 หลัก"
        onInput={handleInput}
        required
        autoFocus
      />
    </label>
    <button className="primary" type="submit"><LogIn/>ยืนยันและเข้าสู่โปรไฟล์</button>
  </form>;
}
