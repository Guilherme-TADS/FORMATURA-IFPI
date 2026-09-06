import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        // Status vocabulary — a confirmed/pending/void state reads as a
        // stamp, not a generic colored pill: bordered in its own ink,
        // square-ish corners, a faint rotation. Used with `stamp` for the
        // full mark; without it, still a distinct hue from the generic
        // variants above so status never gets mistaken for decoration.
        confirmed: "bg-confirmed-bg text-confirmed [a]:hover:bg-confirmed-bg/70",
        pending: "bg-pending-bg text-pending [a]:hover:bg-pending-bg/70",
        void: "bg-void-bg text-void [a]:hover:bg-void-bg/70",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  stamp = false,
  render,
  ...props
}: useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** Renders as an inked stamp mark (bordered, squared, tilted) instead of
     * a soft filled pill — the confirmed-state signature of the receipt
     * world. Pair with variant="confirmed" | "pending" | "void". */
    stamp?: boolean
  }) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(
          badgeVariants({ variant }),
          stamp &&
            "h-auto rounded-sm border-[1.5px] border-current bg-transparent px-1.5 py-0.5 font-semibold tracking-wide uppercase rotate-[-2deg]",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
