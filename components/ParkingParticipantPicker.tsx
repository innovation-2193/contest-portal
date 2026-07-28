"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";

type ParkingParticipant = {
  registration_code: string;
  participant_role: string;
  title: string;
  first_name: string;
  last_name: string;
  phone: string;
  division: string;
  bureau: string;
};

function participantLabel(participant: ParkingParticipant) {
  const name = `${participant.title}${participant.first_name} ${participant.last_name}`.trim();
  const org = [participant.division, participant.bureau].map((item) => item.trim()).filter(Boolean).join(" / ");
  return [name, participant.phone, org || participant.registration_code].filter(Boolean).join(" • ");
}

function searchableText(participant: ParkingParticipant) {
  return [
    participant.registration_code,
    participant.participant_role,
    participant.title,
    participant.first_name,
    participant.last_name,
    participant.phone,
    participant.division,
    participant.bureau,
  ].join(" ").toLowerCase();
}

export function ParkingParticipantPicker({
  participants,
  name = "registrationCode",
  defaultValue = "",
  placeholder = "พิมพ์ชื่อ เบอร์โทร หน่วยงาน หรือรหัส REG",
}: {
  participants: ParkingParticipant[];
  name?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const initialParticipant = useMemo(
    () => participants.find((participant) => participant.registration_code === defaultValue),
    [defaultValue, participants],
  );
  const pickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [resultsStyle, setResultsStyle] = useState<CSSProperties>({});
  const [selectedCode, setSelectedCode] = useState(initialParticipant?.registration_code ?? "");
  const [query, setQuery] = useState(initialParticipant ? participantLabel(initialParticipant) : "");
  const [open, setOpen] = useState(false);

  const filteredParticipants = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matched = normalizedQuery
      ? participants.filter((participant) => searchableText(participant).includes(normalizedQuery))
      : participants;
    return matched;
  }, [participants, query]);

  function choose(participant: ParkingParticipant) {
    setSelectedCode(participant.registration_code);
    setQuery(participantLabel(participant));
    setOpen(false);
  }

  useEffect(() => {
    inputRef.current?.setCustomValidity(!query.trim() || selectedCode ? "" : "กรุณาเลือกรายชื่อจากผลการค้นหา");
  }, [query, selectedCode]);

  useEffect(() => {
    if (!open) return;
    function updateResultsPosition() {
      const rect = pickerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const edgePadding = 16;
      const gap = 6;
      const spaceBelow = window.innerHeight - rect.bottom - edgePadding;
      const spaceAbove = rect.top - edgePadding;
      const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
      const availableSpace = Math.max(openUp ? spaceAbove : spaceBelow, 160);
      const maxHeight = Math.min(360, availableSpace - gap);
      const width = Math.min(rect.width, window.innerWidth - edgePadding * 2);
      setResultsStyle({
        left: Math.min(Math.max(edgePadding, rect.left), window.innerWidth - edgePadding - width),
        maxHeight,
        top: openUp ? Math.max(edgePadding, rect.top - maxHeight - gap) : rect.bottom + gap,
        width,
      });
    }

    updateResultsPosition();
    window.addEventListener("resize", updateResultsPosition);
    window.addEventListener("scroll", updateResultsPosition, true);
    return () => {
      window.removeEventListener("resize", updateResultsPosition);
      window.removeEventListener("scroll", updateResultsPosition, true);
    };
  }, [open, query, filteredParticipants.length]);

  return <div className="parking-picker" ref={pickerRef}>
    <input type="hidden" name={name} value={selectedCode}/>
    <div className="parking-picker-box">
      <Search aria-hidden="true"/>
      <input
        aria-autocomplete="list"
        aria-expanded={open}
        autoComplete="off"
        onBlur={() => window.setTimeout(() => setOpen(false), 140)}
        onChange={(event) => {
          const nextQuery = event.target.value;
          const exactParticipant = participants.find((participant) => {
            const label = participantLabel(participant).toLowerCase();
            const code = participant.registration_code.toLowerCase();
            return label === nextQuery.trim().toLowerCase() || code === nextQuery.trim().toLowerCase();
          });
          setQuery(nextQuery);
          setSelectedCode(exactParticipant?.registration_code ?? "");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={participants.length ? placeholder : "ยังไม่มีรายชื่อ VIP, Exhibitor หรือ Staff"}
        ref={inputRef}
        required
        value={query}
      />
    </div>
    {open && <div className="parking-picker-results" role="listbox" style={resultsStyle}>
      {filteredParticipants.length ? filteredParticipants.map((participant) => {
        const selected = participant.registration_code === selectedCode;
        return <button
          aria-selected={selected}
          className="parking-picker-option"
          key={participant.registration_code}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(participant)}
          role="option"
          type="button"
        >
          <span><b>{participantLabel(participant)}</b><small>{participant.registration_code} • {participant.participant_role}</small></span>
          {selected && <Check aria-hidden="true"/>}
        </button>;
      }) : <div className="parking-picker-empty">ไม่พบรายชื่อที่ค้นหา</div>}
    </div>}
  </div>;
}
