// /tab is now the tabs section of the SETUP page, and this is the door that
// still opens.
//
// Slice 14 built this as a small page of its own and left the call open: the
// honest empty state needed somewhere to go, and it explained the seam. Slice 8
// absorbed it, because the setup page explains every seam in the product and two
// pages explaining one of them is two copies of the same words waiting to
// disagree. The redirect stays rather than the route being deleted: /tab was a
// real address in an earlier build, it is written down in the nav's history and
// possibly in someone's bookmarks, and a 404 teaches a user the hub is
// unreliable when what actually happened is that a page moved.
//
// /tab/<slug> is untouched. That is where your own tabs live.
import { redirect } from "next/navigation";

export default function TabsIndexMoved() {
  redirect("/setup#tabs");
}
