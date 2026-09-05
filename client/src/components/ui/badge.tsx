import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/* Badges are tinted, not filled: a 10% wash of the tone with a 20% border. The
 * only exception is `secondary`, which reuses the opaque secondary surface so a
 * badge can sit inside a card without disappearing. */
const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-0.5 text-xs font-medium [&_svg]:pointer-events-none [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary border border-primary/20",
        secondary: "bg-secondary text-secondary-foreground border border-secondary-border",
        outline: "bg-transparent text-foreground border border-border",
        success: "bg-accent/10 text-accent border border-accent/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(({ className, variant, ...props }, ref) => (
  <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
));
Badge.displayName = "Badge";

export { Badge, badgeVariants };
