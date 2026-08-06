import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  resolveSameOriginDiagnosticEndpoint,
  sanitizeDiagnosticText,
} from "../../src/observability/clientDiagnostics";

describe("client diagnostic privacy boundaries", () => {
  test("strips URL query and fragment state and applies the caller's bound", () => {
    const sanitized = sanitizeDiagnosticText(
      "Failed at https://example.test/app.js?token=private#account and continued",
      43,
    );
    assert.equal(sanitized, "Failed at https://example.test/app.js and c");
    assert.equal(sanitized.includes("private"), false);
    assert.equal(sanitized.includes("account"), false);
  });

  test("accepts only resolved same-origin reporting endpoints", () => {
    assert.equal(
      resolveSameOriginDiagnosticEndpoint("/diagnostics", "https://example.test"),
      "https://example.test/diagnostics",
    );
    assert.equal(
      resolveSameOriginDiagnosticEndpoint("https://example.test/reports", "https://example.test"),
      "https://example.test/reports",
    );
    assert.equal(
      resolveSameOriginDiagnosticEndpoint("https://collector.test/reports", "https://example.test"),
      null,
    );
    assert.equal(resolveSameOriginDiagnosticEndpoint("http://[invalid", "https://example.test"), null);
  });
});
