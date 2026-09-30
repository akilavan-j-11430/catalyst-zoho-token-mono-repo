"use client";

import { useEffect, useRef, useState } from "react";
import { appUrl, authSession } from "@/catalyst/auth_client";
import { Loader } from "@/components/shared/loader";
import { Alert, AlertDescription } from "@/components/ui/alert";

const CONTAINER_ID = "catalyst_signin";
const IFRAME_ID = "iam_iframe";

/*
 * The IAM iframe loads this cross-origin and caches it by URL, and /public serves
 * it with no content hash, so a stale sheet survives a reload and the widget comes
 * back with the platform's own 520px layout. Bump on every edit to the file.
 */
const STYLESHEET = "/catalyst_signin.css?r=2";

const CONTENT_ALLOWANCE = 16;

/** Only until the first measurement lands, a few frames later. */
const INITIAL_HEIGHT = 320;

/**
 * Catalyst serves the IAM page from this same origin - that is how the SDK reaches
 * its document to patch placeholders - so the frame is sized to what it actually
 * renders rather than to a height guessed per step. Whatever a step needs, the
 * container grows to it and nothing inside is cut off.
 *
 * It measures `.signin_container`, IAM's own content box, not the document: the
 * document element stretches to the frame, so it only reports growth once content
 * has already overflowed. The container is content-sized at every step.
 *
 * It has to re-attach on every `load`: `signIn` resolves the moment the iframe is
 * created, when `contentDocument` is still the blank document the browser gives it.
 */
function observeContentHeight(onHeight: (height: number) => void): () => void {
  const frame = document.getElementById(IFRAME_ID);
  if (!(frame instanceof HTMLIFrameElement)) {
    return () => undefined;
  }
  let observer: ResizeObserver | null = null;
  const attach = (): void => {
    const page = frame.contentDocument;
    if (page === null) {
      return;
    }
    const content =
      page.querySelector(".signin_container") ?? page.documentElement;
    observer?.disconnect();
    // The allowance keeps a focus ring or a floated action off the bottom edge.
    observer = new ResizeObserver(() =>
      onHeight(content.scrollHeight + CONTENT_ALLOWANCE),
    );
    observer.observe(content);
    onHeight(content.scrollHeight + CONTENT_ALLOWANCE);
  };
  frame.addEventListener("load", attach);
  attach();
  return () => {
    frame.removeEventListener("load", attach);
    observer?.disconnect();
  };
}

export function SignInWidget() {
  const [failure, setFailure] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in development, and the SDK rebuilds the iframe
    // from scratch on every call.
    if (mounted.current) {
      return;
    }
    mounted.current = true;

    let stop = (): void => undefined;
    authSession()
      .then((auth) =>
        auth.signIn(CONTAINER_ID, {
          redirectUrl: appUrl("/"),
          cssUrl: appUrl(STYLESHEET),
        }),
      )
      .then(() => {
        setReady(true);
        stop = observeContentHeight((height) =>
          setContentHeight((current) =>
            current !== null && Math.abs(current - height) <= 2
              ? current
              : height,
          ),
        );
      })
      .catch(() =>
        setFailure(
          "The sign-in form could not be loaded. Reload to try again.",
        ),
      );

    return () => stop();
  }, []);

  return (
    <div
      className="flex flex-col"
      style={{ height: contentHeight ?? INITIAL_HEIGHT }}
    >
      {failure !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : (
        <>
          {!ready && <Loader label="Loading sign in" />}
          {/* The SDK replaces this element's contents, so it must stay empty in JSX.
          The height is explicit and in pixels on purpose: the iframe the SDK mounts
          is `height: 100%`, and a percentage height only resolves against a definite
          one. It has to sit on this element, the iframe's own parent: moving it up a
          level leaves `h-full` here resolving against nothing. Grown by `min-height`
          on a `flex-1` item instead, the box got taller and the iframe did not,
          cutting the form off partway down. The SDK also leaves the iframe
          `display: inline`, whose baseline gap would overflow this box. */}
          <div
            id={CONTAINER_ID}
            className="w-full [&>iframe]:block"
            style={{ height: contentHeight ?? INITIAL_HEIGHT }}
            hidden={!ready}
          />
        </>
      )}
    </div>
  );
}
