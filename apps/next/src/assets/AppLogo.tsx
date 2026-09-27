import logo from "@/assets/logo/logo.jpg";
import { cn } from "@/utils/cn";

export function AppLogo({ className }: { className?: string }) {
  return (
    <img
      src={logo.src}
      alt="Illusion Realm"
      className={cn("shrink-0 object-cover", className)}
    />
  );
}
