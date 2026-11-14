import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "ui-textarea flex min-h-24 w-full rounded-md border border-[#d7dce3] bg-white px-3 py-2 text-sm leading-relaxed text-[#303846] placeholder:text-[#939ba6] focus-visible:border-[#6e88b8] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#dbe4f3] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
