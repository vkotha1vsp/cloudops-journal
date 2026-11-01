import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "border-transparent bg-primary/15 text-primary",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      outline: "text-muted-foreground",
      aws: "border-transparent bg-aws/15 text-aws",
      azure: "border-transparent bg-azure/15 text-azure",
      devops: "border-transparent bg-devops/15 text-devops",
      warning: "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
      success: "border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
