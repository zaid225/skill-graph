import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-bold uppercase tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border-2 border-border bg-primary text-primary-foreground shadow hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-xs active:translate-x-1 active:translate-y-1 active:shadow-none",
        destructive:
          "border-2 border-border bg-destructive text-destructive-foreground shadow hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-xs active:translate-x-1 active:translate-y-1 active:shadow-none",
        outline:
          "border-2 border-border bg-background text-foreground shadow hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-xs active:translate-x-1 active:translate-y-1 active:shadow-none",
        secondary:
          "border-2 border-border bg-secondary text-secondary-foreground shadow hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-xs active:translate-x-1 active:translate-y-1 active:shadow-none",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline normal-case font-medium tracking-normal",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
