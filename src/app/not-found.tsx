import { Button } from "@/components/ui/button";
import { SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8 text-center">
      <div className="max-w-md animate-in fade-in-up-4 duration-700">
        <SearchX
          className="mx-auto h-20 w-20 text-primary"
          aria-hidden="true"
        />
        <h1 className="mt-8 text-7xl font-extrabold tracking-tighter text-foreground sm:text-9xl font-headline">
          404
        </h1>
        <p className="mt-4 text-xl font-medium text-foreground">
          Page Not Found
        </p>
        <p className="mt-2 text-base text-muted-foreground">
          Sorry, we couldn’t find the page you’re looking for.
        </p>
        <Button asChild className="mt-8">
          <Link href="/">Return to Homepage</Link>
        </Button>
      </div>
    </div>
  );
}
