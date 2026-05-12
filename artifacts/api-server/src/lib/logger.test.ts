import { describe, expect, it } from "vitest";
import pino from "pino";
import { _REDACT_PATHS_FOR_TESTS } from "./logger";

// Build a fresh logger with the same redaction policy as the production
// logger but writing into an in-memory buffer so we can JSON.parse the
// emitted entries.
function captureLogger(): { log: pino.Logger; entries: () => unknown[] } {
  const lines: string[] = [];
  const stream = {
    write(chunk: string) {
      lines.push(chunk);
    },
  };
  const log = pino(
    {
      level: "trace",
      redact: {
        paths: [..._REDACT_PATHS_FOR_TESTS],
        censor: "[redacted]",
      },
    },
    stream as unknown as NodeJS.WritableStream,
  );
  return {
    log,
    entries: () => lines.map((l) => JSON.parse(l) as unknown),
  };
}

describe("logger redaction", () => {
  it("redacts authorization, cookie, set-cookie headers", () => {
    const { log, entries } = captureLogger();
    log.info(
      {
        req: {
          headers: {
            authorization: "Bearer secret-token",
            cookie: "halonote_session=abc",
            "user-agent": "vitest",
          },
        },
        res: { headers: { "set-cookie": ["halonote_session=xyz"] } },
      },
      "request completed",
    );
    const e = entries()[0] as {
      req: { headers: Record<string, unknown> };
      res: { headers: Record<string, unknown> };
    };
    expect(e.req.headers["authorization"]).toBe("[redacted]");
    expect(e.req.headers["cookie"]).toBe("[redacted]");
    expect(e.req.headers["user-agent"]).toBe("vitest"); // not redacted
    expect(e.res.headers["set-cookie"]).toBe("[redacted]");
  });

  it("redacts password + token fields anywhere they appear", () => {
    const { log, entries } = captureLogger();
    log.info({
      user: { id: "usr_1", email: "x@y", password: "hunter2" },
      session: { token: "tok-abc", tokenHash: "deadbeef" },
    });
    const e = entries()[0] as {
      user: { password: string; email: string };
      session: { token: string; tokenHash: string };
    };
    expect(e.user.password).toBe("[redacted]");
    expect(e.user.email).toBe("x@y");
    expect(e.session.token).toBe("[redacted]");
    expect(e.session.tokenHash).toBe("[redacted]");
  });

  it("redacts a FHIR DocumentReference body and patient-identifying description", () => {
    const { log, entries } = captureLogger();
    log.info(
      {
        docRef: {
          patient: "Patient/pt_001",
          content: { text: "SOAP — pt complains of chest pain", base64: "U09BUA==" },
          description: "Aguirre, Marisol — note note_xyz",
        },
        syntheticId: "mock-note_xyz",
      },
      "EHR push (mock)",
    );
    const e = entries()[0] as {
      docRef: {
        patient: string;
        content: { text: string; base64: string };
        description: string;
      };
      syntheticId: string;
    };
    expect(e.docRef.content.text).toBe("[redacted]");
    expect(e.docRef.content.base64).toBe("[redacted]");
    expect(e.docRef.description).toBe("[redacted]");
    // Non-sensitive fields stay intact.
    expect(e.docRef.patient).toBe("Patient/pt_001");
    expect(e.syntheticId).toBe("mock-note_xyz");
  });

  it("redacts FhirError rawBody + outcome when an error object is logged", () => {
    const { log, entries } = captureLogger();
    log.error(
      {
        err: {
          name: "FhirError",
          message: "FHIR PUT failed",
          status: 422,
          rawBody:
            '<OperationOutcome>Patient Marisol Aguirre MRN-10458 missing identifier</OperationOutcome>',
          outcome: {
            resourceType: "OperationOutcome",
            issue: [
              {
                severity: "error",
                code: "required",
                diagnostics: "Patient pt_001 missing identifier",
              },
            ],
          },
        },
        noteId: "note_xyz",
      },
      "EHR push failed",
    );
    const e = entries()[0] as {
      err: { rawBody: string; outcome: unknown; message: string; status: number };
      noteId: string;
    };
    expect(e.err.rawBody).toBe("[redacted]");
    expect(e.err.outcome).toBe("[redacted]");
    expect(e.err.message).toBe("FHIR PUT failed"); // class / status kept
    expect(e.err.status).toBe(422);
    expect(e.noteId).toBe("note_xyz"); // not PHI
  });

  it("redacts a patient-identifying record (mrn, names, dob)", () => {
    const { log, entries } = captureLogger();
    log.info({
      patient: {
        id: "pt_001",
        firstName: "Marisol",
        lastName: "Aguirre",
        dateOfBirth: "1958-07-22",
        mrn: "MRN-10458",
      },
    });
    const e = entries()[0] as {
      patient: Record<string, unknown>;
    };
    expect(e.patient["id"]).toBe("pt_001"); // opaque id is fine
    expect(e.patient["firstName"]).toBe("[redacted]");
    expect(e.patient["lastName"]).toBe("[redacted]");
    expect(e.patient["dateOfBirth"]).toBe("[redacted]");
    expect(e.patient["mrn"]).toBe("[redacted]");
  });

  it("redacts OAuth credentials that may end up in error envelopes", () => {
    const { log, entries } = captureLogger();
    log.error({
      err: {
        message: "token request failed",
        client_secret: "shhh",
        client_assertion: "long.jwt.value",
        access_token: "leaked",
        refresh_token: "also leaked",
      },
    });
    const e = entries()[0] as { err: Record<string, unknown> };
    expect(e.err["client_secret"]).toBe("[redacted]");
    expect(e.err["client_assertion"]).toBe("[redacted]");
    expect(e.err["access_token"]).toBe("[redacted]");
    expect(e.err["refresh_token"]).toBe("[redacted]");
    expect(e.err["message"]).toBe("token request failed");
  });

  it("redacts a request body (route handlers occasionally log {req})", () => {
    const { log, entries } = captureLogger();
    log.info({
      req: {
        method: "POST",
        url: "/api/notes",
        body: { patientId: "pt_001", body: "PHI clinical note" },
      },
    });
    const e = entries()[0] as { req: { body: unknown; method: string } };
    expect(e.req.body).toBe("[redacted]");
    expect(e.req.method).toBe("POST");
  });
});
