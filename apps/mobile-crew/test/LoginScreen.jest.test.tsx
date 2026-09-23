import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach } from "@jest/globals";

import LoginScreen from "../src/screens/LoginScreen.tsx";

describe("LoginScreen", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.EXPO_PUBLIC_ENABLE_DEVELOPMENT_TEST_AUTH;
    jest.restoreAllMocks();
  });

  it("hides the Stage 14 control unless the explicit public flag is enabled", async () => {
    const defaultRender = await render(<LoginScreen onSignedIn={jest.fn()} />);
    expect(defaultRender.queryByTestId("development-test-login")).toBeNull();
    process.env.EXPO_PUBLIC_ENABLE_DEVELOPMENT_TEST_AUTH = "true";
    const enabledRender = await render(<LoginScreen onSignedIn={jest.fn()} />);
    expect(enabledRender.getByTestId("development-test-login")).toBeTruthy();
  });

  it("uses the development session endpoint and persists before navigation", async () => {
    process.env.EXPO_PUBLIC_ENABLE_DEVELOPMENT_TEST_AUTH = "true";
    const onSignedIn = jest.fn();
    const issued = { token: "synthetic-token", token_type: "Bearer", expires_at: "2026-09-18T17:00:00.000Z", actor_id: "STAFF-001", role: "field_crew", synthetic_test_session: true };
    const calls: string[] = [];
    global.fetch = jest.fn(async (input) => {
      calls.push(String(input));
      return new Response(calls.length === 1 ? JSON.stringify(issued) : JSON.stringify({ healthy: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const { getByTestId } = await render(<LoginScreen onSignedIn={onSignedIn} />);
    await fireEvent.changeText(getByTestId("input-api-base-url"), "http://127.0.0.1:3001");
    await fireEvent.press(getByTestId("development-test-login"));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(["http://127.0.0.1:3001/api/development/test-session", "http://127.0.0.1:3001/api/support/readiness"]);
    expect(onSignedIn.mock.calls[0][0]).toEqual(expect.objectContaining({ actorId: "STAFF-001", actorRole: "field_crew", syntheticTestSession: true }));
    expect(getByTestId("input-auth-token").props.value).toBe("");
  });

  it("prevents double submission while development issuance is pending", async () => {
    process.env.EXPO_PUBLIC_ENABLE_DEVELOPMENT_TEST_AUTH = "true";
    let resolveRequest!: (response: Response) => void;
    global.fetch = jest.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; })) as unknown as typeof fetch;
    const { getByTestId } = await render(<LoginScreen onSignedIn={jest.fn()} />);
    await fireEvent.changeText(getByTestId("input-api-base-url"), "http://127.0.0.1:3001");
    const button = getByTestId("development-test-login");
    void fireEvent.press(button);
    await waitFor(() => expect(getByTestId("development-test-login").props.accessibilityState?.disabled).toBe(true));
    fireEvent.press(button);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    resolveRequest(new Response("{}", { status: 500 }));
  });

  it("keeps sign-in disabled until every field is filled", async () => {
    const { getByTestId } = await render(<LoginScreen onSignedIn={jest.fn()} />);

    expect(getByTestId("submit-sign-in").props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(getByTestId("input-api-base-url"), "https://api.example.test");
    await fireEvent.changeText(getByTestId("input-auth-token"), "token-123");
    await fireEvent.changeText(getByTestId("input-actor-id"), "crew-1");
    await fireEvent.changeText(getByTestId("input-actor-role"), "field_crew");

    expect(getByTestId("submit-sign-in").props.accessibilityState?.disabled).toBe(false);
  });

  it("applies vertical alignment to the scroll content container", async () => {
    const { getByTestId } = await render(<LoginScreen onSignedIn={jest.fn()} />);

    expect(getByTestId("login-screen").props.contentContainerStyle).toEqual(
      expect.objectContaining({ flexGrow: 1, justifyContent: "center" })
    );
  });

  it("calls onSignedIn with a trimmed session once the token verifies", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 })) as unknown as typeof fetch;
    const onSignedIn = jest.fn();

    const { getByTestId } = await render(<LoginScreen onSignedIn={onSignedIn} />);
    await fireEvent.changeText(getByTestId("input-api-base-url"), "https://api.example.test/");
    await fireEvent.changeText(getByTestId("input-auth-token"), " token-123 ");
    await fireEvent.changeText(getByTestId("input-actor-id"), "crew-1");
    await fireEvent.changeText(getByTestId("input-actor-role"), "field_crew");

    await fireEvent.press(getByTestId("submit-sign-in"));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(onSignedIn).toHaveBeenCalledWith({
      apiBaseUrl: "https://api.example.test",
      authToken: "token-123",
      actorId: "crew-1",
      actorRole: "field_crew",
      deviceId: expect.any(String)
    });
  });

  it("shows an error and does not sign in when the token is rejected", async () => {
    global.fetch = jest.fn(
      async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 401 })
    ) as unknown as typeof fetch;
    const onSignedIn = jest.fn();

    const { getByTestId } = await render(<LoginScreen onSignedIn={onSignedIn} />);
    await fireEvent.changeText(getByTestId("input-api-base-url"), "https://api.example.test");
    await fireEvent.changeText(getByTestId("input-auth-token"), "bad-token");
    await fireEvent.changeText(getByTestId("input-actor-id"), "crew-1");
    await fireEvent.changeText(getByTestId("input-actor-role"), "field_crew");

    await fireEvent.press(getByTestId("submit-sign-in"));

    await waitFor(() => expect(getByTestId("login-error")).toBeTruthy());
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});
