import { Toaster as Sonner, toast } from "sonner";

/**
 * Sonner wired to the app's palette.
 *
 * The defaults ship their own light/dark colours and a soft shadow, which
 * fights the flat borders and hard offset shadows used everywhere else. These
 * class overrides pull the toast back onto the theme tokens so it reads as
 * part of the same UI.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      duration={3500}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group flex w-full items-start gap-2.5 rounded-lg border-2 border-border bg-card p-3 text-card-foreground shadow font-sans text-sm",
          title: "font-bold uppercase tracking-wide text-xs",
          description: "text-xs text-muted-foreground mt-0.5",
          actionButton:
            "ml-auto shrink-0 rounded-md border-2 border-border bg-primary px-2 py-0.5 text-xs font-bold uppercase text-primary-foreground",
          cancelButton:
            "ml-auto shrink-0 rounded-md border-2 border-border bg-secondary px-2 py-0.5 text-xs font-bold uppercase text-secondary-foreground",
          closeButton: "border-2 border-border bg-background text-foreground",
          // Left edge carries the status colour so success and failure are
          // distinguishable at a glance without restyling the whole toast.
          success: "border-l-8 border-l-emerald-500",
          error: "border-l-8 border-l-destructive",
          info: "border-l-8 border-l-primary",
        },
      }}
    />
  );
}

export { toast };
