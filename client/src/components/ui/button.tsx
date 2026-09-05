import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * These class recipes are byte-equivalent to the ones top-rated.team's buttons
 * emit. Two invariants keep them that way:
 *
 * 1. Hover and active states come from the `hover-elevate` / `active-elevate-2`
 *    overlay in index.css. No variant may add a `hover:bg-*` class — the
 *    overlay already tints the fill, so a background hover would double up and
 *    visibly diverge from the main site.
 * 2. Opaque variants carry `border border-<tone>-border`, whose colour is
 *    derived from the fill in index.css. The border is part of the shape, not
 *    decoration: dropping it changes the button's height.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover-elevate active-elevate-2 bg-primary text-primary-foreground border border-primary-border",
        secondary:
          "hover-elevate active-elevate-2 bg-secondary text-secondary-foreground border border-secondary-border",
        outline: "hover-elevate active-elevate-2 border border-border bg-transparent",
        ghost: "hover-elevate active-elevate-2 border border-transparent",
        destructive:
          "hover-elevate active-elevate-2 bg-destructive text-destructive-foreground border border-destructive-border",
      },
      size: {
        default: "min-h-9 px-4 py-2 text-sm",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-11 rounded-md px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render the child element instead of a <button>, keeping the classes. */
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
