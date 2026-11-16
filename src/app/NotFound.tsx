import Link from 'next/link';

/** Shown both when something does not exist and when this person may not see it. */
export function NotFound() {
  return (
    <>
      <h1>Page not found</h1>
      <p className="notice">There is nothing here, or it is not yours to see. <Link href="/">Go to the home page</Link>.</p>
    </>
  );
}
