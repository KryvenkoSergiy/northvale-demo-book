import { Fragment } from "react";
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/fraunces/opsz-italic.css";

/** The demo's title face; loaded only in the demo chunk. */
export const display = "font-[family-name:Fraunces_Variable,serif]";

/**
 * Heading split into word masks of single characters for GSAP (`[data-char]` slides up inside its word, `[data-flip]` wipes the whole line).
 * Screen readers get the whole text from aria-label; the split copy is aria-hidden.
 */
export default function SplitTitle({ as: Tag, text, className }: { as: "h1" | "h2"; text: string; className?: string }) {
  return (
    <Tag aria-label={text} className={className}>
      <span aria-hidden data-flip className="block">
        {text.split(" ").map((word, w) => (
          <Fragment key={w}>
            {w > 0 && " "}
            {/* Padding keeps descenders inside the mask. */}
            <span className="-mb-[0.15em] inline-block overflow-hidden pb-[0.15em] align-top">
              {[...word].map((c, i) => (
                <span key={i} data-char className="inline-block">
                  {c}
                </span>
              ))}
            </span>
          </Fragment>
        ))}
      </span>
    </Tag>
  );
}
