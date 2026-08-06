# Security policy

## Supported version

Security maintenance applies to the current `main` branch and the artifact at
the [live GitHub Pages site](https://akshin0906.github.io/solar-system-sim-design/).
Older commits, local modifications, and third-party forks are not maintained
release channels.

The deployed artifact publishes its exact commit and workflow run in
[`build-info.json`](https://akshin0906.github.io/solar-system-sim-design/build-info.json).

## Reporting a vulnerability

Please do not open a public issue containing exploit details, secrets, private
data, or a proof of concept that could put visitors at risk.

Use GitHub's **Report a vulnerability** action on the repository's
[Security tab](https://github.com/Akshin0906/solar-system-sim-design/security).
Private vulnerability reporting is enabled, so the report and follow-up remain
inside a private security advisory rather than a public issue.

A useful report includes:

- the affected build identity or commit;
- browser, operating system, and relevant extension or service-worker state;
- impact and realistic attack prerequisites;
- minimal reproduction steps; and
- any suggested mitigation, if available.

## Scope notes

This is a client-only educational PWA. Relevant reports include dependency or
workflow compromise, unsafe URL/view-state handling, service-worker cache
poisoning, cross-site scripting, and exposure of information that was expected
to remain private. Scientific-model disagreements without a security impact
belong in a normal bug report.
