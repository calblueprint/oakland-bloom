import Link from "next/link";
import { ErrorMain } from "./styles";

export default function ErrorPage() {
  return (
    <ErrorMain>
      <h1>Something went wrong</h1>
      <Link href="/">Go back home</Link>
    </ErrorMain>
  );
}
