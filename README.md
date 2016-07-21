Simple-SWF
=======
An actually simpler wrapper around AWS Simple Workflow Service

## What is it?
Simple-SWF provides an opionated wrapper and classes around the SWF APIs that make it usable by mere mortals.

This library takes care of:
- Provider polling works for both decision and activity tasks
- A Claim Check system for dealing with the input and control fields that have limited size
- A JS API you can implement for both activities and deciders

it does this while remaining highly customizable and configurable. All SWF options
are exposed as are almost* all decision types

\* currently missing external workflow decision types

## Still not enough?
This API mainly serves as a layer for `ftl-engine`, which provides a much more batteries-included approach to running workflows.

## Docs
This codebase is written in typescript, so the typescript annotations mostly serve as the documentation for API.

Also see the tests for more details

## Contributing

All contributions are welcome, but to help make things easier, please follow these steps

1. What kind of contribution are you making? For bugs and small changes, please just open a pull request, for larger changes, open an issue first to discuss the change
2. Make your change
3. Run the tests `npm run test`
4. Run the linter `npm run lint`
5. Open the PR
