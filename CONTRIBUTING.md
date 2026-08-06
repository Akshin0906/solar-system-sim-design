# Contributing

Thank you for taking the time to review the project.

This is currently a portfolio repository, not an open contribution project.
Unsolicited code pull requests are not accepted. Reproducible bug reports and
focused product or scientific feedback are welcome through the issue templates.
Please discuss any proposed code contribution with the maintainer before doing
work intended for submission.

Participation in project spaces is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md).

Public access and this process guidance do not grant reuse or contribution
rights. See [LICENSE](LICENSE) for the repository's current source-visible
status.

## Useful reports

Before filing an issue:

1. Reproduce against the [live site](https://akshin0906.github.io/solar-system-sim-design/)
   or current `main`.
2. Record the live [`build-info.json`](https://akshin0906.github.io/solar-system-sim-design/build-info.json)
   commit when applicable.
3. Search existing issues for the same behavior.
4. Remove secrets, personal data, tokens, and sensitive security details.

For suspected vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## Maintainer quality gate

An invited change should be narrowly scoped, explain its user or model impact,
and update documentation when behavior or scientific assumptions change. Before
review, run:

```bash
npm ci
npm run check:release
```

Changes to scientific inputs or conclusions should cite a primary source and
add an independent verifier where practical. UI changes should include keyboard,
reduced-motion, responsive, and browser considerations. New media must include
provenance and an evidence-backed rights status in
[ASSET_ATTRIBUTION.md](ASSET_ATTRIBUTION.md).

## Dependency maintenance

Dependabot checks npm packages and GitHub Actions monthly. Compatible minor and
patch updates are grouped; major upgrades remain separate so each breaking change
can be reviewed against its upstream migration guide, release notes, and security
advisories. Dependency pull requests are never merged solely because they are
automated: they must pass `npm run check:release`, and major GitHub Actions updates
also require an explicit permission and immutable-SHA review.

Security alerts are triaged when they arrive rather than waiting for the monthly
maintenance window. A security-relevant major may be prioritized immediately, with
the compatibility decision and any temporary mitigation recorded in its pull request.
