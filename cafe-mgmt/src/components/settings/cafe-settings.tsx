"use client";

import { useTransition } from "react";
import { updateCafeSettings } from "@/actions/settings.actions";
import { useToast } from "@/components/ui/toast";

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
  { value: "UTC", label: "UTC" },
];

export function CafeSettings({
  initialTimezone,
}: {
  initialTimezone: string;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleTimezoneChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const timezone = e.target.value;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("timezone", timezone);
      const result = await updateCafeSettings(formData);
      if (result.success) {
        toast("Settings saved");
      } else {
        toast(result.error);
      }
    });
  }

  return (
    <div>
      <label
        htmlFor="timezone"
        className="text-meta block mb-[var(--space-1)] font-medium text-[var(--text-primary)]"
      >
        Timezone
      </label>
      <select
        id="timezone"
        defaultValue={initialTimezone}
        onChange={handleTimezoneChange}
        disabled={isPending}
        className="w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-body focus-ring bg-[var(--bg-primary)]"
      >
        {TIMEZONES.map((tz) => (
          <option key={tz.value} value={tz.value}>
            {tz.label}
          </option>
        ))}
      </select>
    </div>
  );
}
