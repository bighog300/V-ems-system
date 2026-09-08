import { createRef } from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { describe, it, expect } from "@jest/globals";

import SignaturePad, { type SignaturePadHandle } from "../src/components/SignaturePad.tsx";

function touch(locationX: number, locationY: number) {
  return { nativeEvent: { locationX, locationY } };
}

describe("SignaturePad", () => {
  it("capture() resolves null when nothing has been drawn", async () => {
    const ref = createRef<SignaturePadHandle>();
    await render(<SignaturePad ref={ref} testID="pad" />);

    await expect(ref.current?.capture()).resolves.toBeNull();
  });

  it("capture() resolves a data URI after a stroke is drawn", async () => {
    const ref = createRef<SignaturePadHandle>();
    const { getByTestId } = await render(<SignaturePad ref={ref} testID="pad" />);
    const pad = getByTestId("pad");

    await fireEvent(pad, "responderGrant", touch(10, 10));
    await fireEvent(pad, "responderMove", touch(20, 20));
    await fireEvent(pad, "responderRelease", touch(20, 20));

    await expect(ref.current?.capture()).resolves.toBe("data:image/png;base64,fake-signature-base64");
  });

  it("a single tap with no movement is not recorded as a stroke", async () => {
    const ref = createRef<SignaturePadHandle>();
    const { getByTestId } = await render(<SignaturePad ref={ref} testID="pad" />);
    const pad = getByTestId("pad");

    await fireEvent(pad, "responderGrant", touch(10, 10));
    await fireEvent(pad, "responderRelease", touch(10, 10));

    await expect(ref.current?.capture()).resolves.toBeNull();
  });

  it("clear() resets a drawn signature back to empty", async () => {
    const ref = createRef<SignaturePadHandle>();
    const { getByTestId } = await render(<SignaturePad ref={ref} testID="pad" />);
    const pad = getByTestId("pad");

    await fireEvent(pad, "responderGrant", touch(10, 10));
    await fireEvent(pad, "responderMove", touch(30, 30));
    await fireEvent(pad, "responderRelease", touch(30, 30));
    await expect(ref.current?.capture()).resolves.not.toBeNull();

    act(() => {
      ref.current?.clear();
    });
    await expect(ref.current?.capture()).resolves.toBeNull();
  });
});
