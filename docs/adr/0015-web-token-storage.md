# ADR 0001: Where the web dashboard keeps its login tokens

- **Status:** Accepted
- **Date:** 2026-10-12
- **Area:** `apps/web`

## Context

The web dashboard signs in with the FieldLens API. The API gives two tokens:

- an **access token**, which is short-lived and is sent with every request;
- a **refresh token**, which lives longer and is used to get a new access token.

The API rotates refresh tokens. Each refresh token works only once. If the same
one is used a second time, the API rejects it.

A web page can lose everything in memory when the user reloads it. We want the
user to stay signed in after a reload, so something must be saved somewhere.

## Decision

- The **access token** is kept only in memory (a JavaScript variable). A reload
  removes it.
- The **refresh token** is saved in `localStorage` under the key
  `fieldlens.refreshToken`.
- When the page starts, the app uses the saved refresh token to get a new access
  token. This is how the user stays signed in after a reload.
- When the API says the refresh token is not valid any more (status 400, 401 or
  403), the app deletes it and shows the login page.
- When the network is down, the app keeps the token. The user is still signed in;
  the server was just not reachable.
- Only one refresh runs at a time. If three requests fail with 401 together,
  they wait for the same refresh. Two refreshes at once would use the same
  single-use token twice, and the API would end the session.

The code is in `apps/web/src/lib/tokenStorage.ts` and
`apps/web/src/lib/apiClient.ts`. The tests are in
`apps/web/src/lib/apiClient.test.ts`.

## Why

- It works with the API as it is today. No API change is needed.
- It is simple, and it matches how the Flutter app refreshes its tokens.
- The access token is never saved, so a stolen copy of the page storage does not
  give a long-lived access token by itself.

## The risk: XSS

Any JavaScript that runs on our page can read `localStorage`. If an attacker
finds a way to run their script on the dashboard (this is called XSS, cross-site
scripting), they can copy the refresh token and use it from another computer.
An `httpOnly` cookie would not have this problem, because scripts cannot read it.

Rotation helps a little. If the attacker and the real user both use the same
token, the API sees a reused token and rejects it. But the attacker could use it
first.

## How we reduce the risk

- React escapes text by default. We do not use `dangerouslySetInnerHTML`.
- We do not load scripts from other sites.
- The access token is short-lived and is never saved.
- Refresh tokens are single-use and are rotated by the API.
- Before a real launch we will add a Content Security Policy (CSP) header, which
  limits which scripts the browser may run.

## Options we did not choose

**1. Keep both tokens only in memory.**
Safer against XSS, but the user must sign in again after every reload. This is a
poor experience for a dashboard that people keep open all day.

**2. Refresh token in an `httpOnly` cookie.**
This is the safest choice for a browser. We did not choose it now because it needs
changes in the API and in the app:
- the API must set and read the cookie (`HttpOnly`, `Secure`, `SameSite`);
- CORS must allow credentials, and cannot use a wildcard origin;
- we must protect against CSRF, because browsers send cookies automatically;
- the Flutter app still needs tokens in the response body, so the API must support both.

## Consequences

- The dashboard has a known XSS trade-off. We accept it while the dashboard is an
  internal tool used by administrators.
- Every new page and library must be reviewed with XSS in mind.

## When to look at this again

Move to the `httpOnly` cookie option before any of these happen:
- the dashboard is opened to people outside the team;
- the dashboard shows or edits sensitive customer data;
- we add a feature that renders HTML from users.
