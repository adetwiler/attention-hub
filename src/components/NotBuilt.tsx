// "NOT BUILT, TELL US IF YOU WANT IT": the third marketing beat, in the product.
//
// Naming the absences is the point. A hub that quietly implies it can do
// everything is a hub whose privacy claims a reader also discounts, so the things
// that are missing get a list of their own with a link that files the request.
//
// IT IS A STATIC LIST, AND IT WILL STAY ONE. An in-app wishlist that read GitHub
// for live vote counts was considered and rejected on ADR-0002: that is a second
// outbound call on a product whose headline is that it makes one, and the
// pre-commit gate blocks any non-loopback URL under src/ for exactly that reason.
// The links are addresses a person clicks in their own browser. Reactions on the
// issues are the vote count, at zero cost to the promise.
//
// Nothing here is a roadmap date. Each row says what the thing is and that it is
// not here, which is all that is true today.

/** The issue tracker. The one channel for feedback, per the README. */
const ISSUES_NEW = "https://github.com/adetwiler/attention-hub/issues/new"; // hub-no-request: the address of a link the USER clicks. Nothing in this file fetches anything.

const BODY = `I want this.

What I would use it for:

(Anything about how you work helps. What gets asked for gets built.)
`;

/** A prefilled new issue, so saying "I want this" costs one click and one line. */
function wishHref(title: string): string {
  return `${ISSUES_NEW}?title=${encodeURIComponent(`Wishlist: ${title}`)}&body=${encodeURIComponent(BODY)}`;
}

interface Wish {
  id: string;
  title: string;
  /** What it is, and the honest reason it is not here. One sentence. */
  what: string;
}

const WISHES: readonly Wish[] = [
  {
    id: "modules",
    title: "the module system",
    what: "Surfaces with code of their own, living in a folder an update never touches. Tabs are the config-only version of this, and they are what ships today.",
  },
  {
    id: "self-build",
    title: "the hub building itself",
    what: "Describing a surface you want and having your own AI tool build it into the hub, as a normal action you can inspect and undo.",
  },
  {
    id: "board",
    title: "the board",
    what: "The room behind BOARD: work in flight as cards you move, rather than a list of what is running.",
  },
  {
    id: "teams",
    title: "more than one person",
    what: "The hub is single user today. Multi-user is on the roadmap and nothing about it is built.",
  },
  {
    id: "email-digest",
    title: "an email digest",
    what: "Being emailed what is waiting while you are away from the machine. It was built and then cut before release: this hub makes zero outbound calls, and that promise is worth more without a footnote than the feature was worth with one.",
  },
];

/** The list, on TODAY, under everything that is actually running. */
export default function NotBuilt() {
  return (
    <section className="card">
      <span className="hd">Not built yet, and worth saying so</span>
      <p className="empty">
        These are named because they are missing. Each one files a prefilled issue: what gets asked
        for gets built, and the count of people asking is the only thing deciding the order.
      </p>
      <ul className="wishes">
        {WISHES.map((wish) => (
          <li key={wish.id} className="wish">
            <a className="link" href={wishHref(wish.title)} target="_blank" rel="noreferrer">
              {wish.title}
            </a>
            <span className="wish-what">{wish.what}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
