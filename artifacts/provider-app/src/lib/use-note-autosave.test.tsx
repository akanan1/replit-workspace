import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const createNoteMock = vi.fn();
const updateNoteMock = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useCreateNote: () => ({
    mutateAsync: createNoteMock,
    isPending: false,
    error: null,
  }),
  useUpdateNote: () => ({
    mutateAsync: updateNoteMock,
    isPending: false,
    error: null,
  }),
  getListNotesQueryKey: (params?: { patientId: string }) =>
    params ? ["/api/notes", params] : ["/api/notes"],
}));

import { useNoteAutosave } from "./use-note-autosave";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useNoteAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createNoteMock.mockReset();
    updateNoteMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a note after the debounce window elapses", async () => {
    createNoteMock.mockResolvedValue({ id: "note_1" });

    const { result, rerender } = renderHook(
      ({ body }: { body: string }) =>
        useNoteAutosave({ body, patientId: "pt_1", debounceMs: 1000 }),
      { wrapper, initialProps: { body: "" } },
    );

    rerender({ body: "soap subjective" });
    expect(result.current.status).toBe("dirty");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(createNoteMock).toHaveBeenCalledWith({
      data: { patientId: "pt_1", body: "soap subjective" },
    });
    expect(result.current.draftId).toBe("note_1");
    expect(result.current.status).toBe("saved");
  });

  it("PATCHes the existing draft on subsequent saves", async () => {
    createNoteMock.mockResolvedValue({ id: "note_42" });
    updateNoteMock.mockResolvedValue({ id: "note_42" });

    const { result, rerender } = renderHook(
      ({ body }: { body: string }) =>
        useNoteAutosave({ body, patientId: "pt_1", debounceMs: 500 }),
      { wrapper, initialProps: { body: "first" } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(createNoteMock).toHaveBeenCalledTimes(1);

    rerender({ body: "first revised" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(updateNoteMock).toHaveBeenCalledWith({
      id: "note_42",
      data: { body: "first revised" },
    });
    expect(createNoteMock).toHaveBeenCalledTimes(1);
    expect(result.current.draftId).toBe("note_42");
  });

  it("flush() saves immediately and clears the timer", async () => {
    createNoteMock.mockResolvedValue({ id: "note_99" });

    const { result, rerender } = renderHook(
      ({ body }: { body: string }) =>
        useNoteAutosave({ body, patientId: "pt_1", debounceMs: 10_000 }),
      { wrapper, initialProps: { body: "" } },
    );

    rerender({ body: "urgent" });

    let flushed: string | null = null;
    await act(async () => {
      flushed = await result.current.flush();
    });
    expect(flushed).toBe("note_99");
    expect(createNoteMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(createNoteMock).toHaveBeenCalledTimes(1);
  });

  it("does not save an empty body", async () => {
    const { rerender } = renderHook(
      ({ body }: { body: string }) =>
        useNoteAutosave({ body, patientId: "pt_1", debounceMs: 100 }),
      { wrapper, initialProps: { body: "" } },
    );

    rerender({ body: "   " });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(createNoteMock).not.toHaveBeenCalled();
  });

  it("surfaces an error status when the save fails", async () => {
    createNoteMock.mockRejectedValueOnce(new Error("network down"));

    const { result, rerender } = renderHook(
      ({ body }: { body: string }) =>
        useNoteAutosave({ body, patientId: "pt_1", debounceMs: 100 }),
      { wrapper, initialProps: { body: "" } },
    );

    rerender({ body: "draft" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/network down/);
  });
});
