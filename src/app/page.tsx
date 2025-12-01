import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl font-headline">
          Welcome!
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          This is an example application.
        </p>
        <Button asChild variant="outline" className="mt-8">
          <Link href="/a-page-that-does-not-exist">
            See the 404 Page
          </Link>
        </Button>
      </div>
    </main>
  );
}
