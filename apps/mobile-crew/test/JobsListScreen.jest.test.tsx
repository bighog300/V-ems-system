import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach } from "@jest/globals";

import JobsListScreen from "../src/screens/JobsListScreen.tsx";
import type { AssignedJob } from "../src/api/assignments.ts";
import type { Session } from "../src/auth/session.ts";

const session: Session = {
  apiBaseUrl: "https://api.example.test",
  authToken: "token-123",
  actorId: "crew-1",
  actorRole: "field_crew"
};

const job: AssignedJob = {
  assignment_id: "assignment-1",
  status: "en_route",
  vehicle_status: "responding",
  vehicle_id: "medic-7",
  crew_ids: ["crew-1"],
  updated_at: "2026-09-01T00:00:00.000Z",
  incident: {
    incident_id: "incident-1",
    priority: "high",
    status: "active",
    location_summary: "123 Main St",
    created_at: "2026-09-01T00:00:00.000Z"
  }
};

describe("JobsListScreen", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("loads and renders assigned jobs, then navigates to the selected one", async () => {
    global.fetch = jest.fn(
      async () => new Response(JSON.stringify({ assignments: [job] }), { status: 200 })
    ) as unknown as typeof fetch;
    const onSelectJob = jest.fn();

    const { getByTestId } = await render(<JobsListScreen session={session} onSignedOut={jest.fn()} onSelectJob={onSelectJob} />);

    await waitFor(() => expect(getByTestId("job-assignment-1")).toBeTruthy());

    await fireEvent.press(getByTestId("job-assignment-1"));
    expect(onSelectJob).toHaveBeenCalledWith(job);
  });

  it("shows an empty state when there are no active assignments", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ assignments: [] }), { status: 200 })) as unknown as typeof fetch;

    const { getByTestId } = await render(<JobsListScreen session={session} onSignedOut={jest.fn()} onSelectJob={jest.fn()} />);

    await waitFor(() => expect(getByTestId("jobs-empty")).toBeTruthy());
  });

  it("shows a retry option when loading fails", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 })) as unknown as typeof fetch;

    const { getByTestId } = await render(<JobsListScreen session={session} onSignedOut={jest.fn()} onSelectJob={jest.fn()} />);

    await waitFor(() => expect(getByTestId("jobs-error")).toBeTruthy());
    expect(getByTestId("jobs-retry")).toBeTruthy();
  });

  it("clears the session and signs out", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ assignments: [] }), { status: 200 })) as unknown as typeof fetch;
    const onSignedOut = jest.fn();

    const { getByTestId } = await render(<JobsListScreen session={session} onSignedOut={onSignedOut} onSelectJob={jest.fn()} />);
    await waitFor(() => expect(getByTestId("jobs-empty")).toBeTruthy());

    await fireEvent.press(getByTestId("sign-out"));
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
  });

  it("pressing Sync now calls the provided syncNow", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ assignments: [] }), { status: 200 })) as unknown as typeof fetch;
    const syncNow = jest.fn(async () => {});

    const { getByTestId } = await render(
      <JobsListScreen
        session={session}
        onSignedOut={jest.fn()}
        onSelectJob={jest.fn()}
        sync={{ syncing: false, lastResult: null, syncNow }}
      />
    );
    await waitFor(() => expect(getByTestId("jobs-empty")).toBeTruthy());

    await fireEvent.press(getByTestId("sync-now"));
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it("shows a pending-items sync status when the last sync left items unsynced", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ assignments: [] }), { status: 200 })) as unknown as typeof fetch;

    const { getByTestId } = await render(
      <JobsListScreen
        session={session}
        onSignedOut={jest.fn()}
        onSelectJob={jest.fn()}
        sync={{
          syncing: false,
          lastResult: { attempted: 2, acknowledged: 0, retrying: 2, failed: 0, conflicted: 0 },
          syncNow: jest.fn(async () => {})
        }}
      />
    );

    await waitFor(() => expect(getByTestId("sync-status")).toBeTruthy());
    expect(getByTestId("sync-status").props.children).toContain("waiting to sync");
  });
});
