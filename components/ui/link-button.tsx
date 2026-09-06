import Link from "next/link";
import type { ComponentProps } from "react";
import { Button, type buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";

// Button styled as a Next.js Link. Base UI's Button defaults to
// nativeButton=true and warns if the rendered element isn't a real
// <button> — this wrapper always sets it correctly so call sites don't
// have to remember.
export function LinkButton({
  href,
  variant,
  size,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> &
  VariantProps<typeof buttonVariants> & { className?: string }) {
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      nativeButton={false}
      render={<Link href={href} {...props} />}
    >
      {children}
    </Button>
  );
}
