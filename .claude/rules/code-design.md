# Code design

Two rules for every workspace: behaviour lives in classes, and a class or a system design
follows a pattern that already has a name.

## Classes over functions

A module exports a class named for its domain role, or the types and constants that class
uses. Not a loose set of exported functions.

- **A stateless service is a class with static members.** Its constants, caches and helpers
  are `private static` members referenced through the class name, never module-level
  `const`s or functions beside it.
- **Something that holds state per use is an instance class**, with a `private` constructor
  and a `static create(...)` when construction must stay in one place.
- **A single-caller helper is still a member**, not a free function next to the class. If it
  is only a few lines, inline it instead.

Exceptions, where the framework dictates the shape:

- React components and hooks
- Express route handlers and middleware
- entry points and bundle scripts
- callbacks a vendor API requires
- the Catalyst wrappers' module-private SDK accessors, which `catalyst-sdk.md` prescribes

## Name the pattern

Before inventing a shape, use the established pattern that fits - Repository, Adapter,
Facade, Strategy, Factory, Observer, Singleton - and say which one in the class's doc
comment.

A system design names its patterns the same way - publish/subscribe, cache-aside,
write-through, idempotent consumer, backpressure, retry with backoff - and states in those
terms how it handles consistency, failure and recovery. `docs/architecture.md` is where
that goes.

## A pattern still has to earn its place

A pattern picks between shapes the code needs today. It is never a reason to add a layer.
An interface with one implementation and no second in sight, a factory for a class built in
one place, or a strategy with one strategy is the hypothetical-future abstraction the
root instructions rule out. The pattern arrives with its second case, and the second case
says what the shape should be.
