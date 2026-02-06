"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface InlineAllocationEditorProps {
  currentAmount: number;
  onSave: (amount: number) => Promise<void>;
  onCancel: () => void;
}

export function InlineAllocationEditor({
  currentAmount,
  onSave,
  onCancel,
}: InlineAllocationEditorProps) {
  const [value, setValue] = useState(currentAmount.toString());
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const handleSubmit = async () => {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) {
      onCancel();
      return;
    }

    const newAllocationAmount = parsed - currentAmount;
    if (newAllocationAmount === 0) {
      onCancel();
      return;
    }

    setIsSaving(true);
    try {
      await onSave(newAllocationAmount);
    } catch {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="flex justify-end">
      <Input
        ref={inputRef}
        type="number"
        step="0.01"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSubmit}
        disabled={isSaving}
        className={cn(
          "h-8 w-28 text-right tabular-nums",
          isSaving && "opacity-50",
        )}
        data-qa="allocation-input"
      />
    </div>
  );
}
