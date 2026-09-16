import { fireEvent, render } from "@testing-library/react-native";
import { jest, describe, it, expect } from "@jest/globals";

import IncidentStatusStepper from "../src/components/IncidentStatusStepper.tsx";

describe("IncidentStatusStepper", () => {
  it("shows the primary action for the current status and calls onAction with its action name", async () => {
    const onAction = jest.fn();
    const { getByTestId } = await render(<IncidentStatusStepper status="Assigned" onAction={onAction} />);

    const button = getByTestId("status-primary-action");
    expect(button.props.accessibilityLabel).toBe("Acknowledge");

    fireEvent.press(button);
    expect(onAction).toHaveBeenCalledWith("acknowledge_assignment");
  });

  it("advances the primary action label through the pipeline as status changes", async () => {
    const { getByTestId, rerender } = await render(<IncidentStatusStepper status="Crew Acknowledged" onAction={jest.fn()} />);
    expect(getByTestId("status-primary-action").props.accessibilityLabel).toBe("Depart to scene");

    await rerender(<IncidentStatusStepper status="En Route" onAction={jest.fn()} />);
    expect(getByTestId("status-primary-action").props.accessibilityLabel).toBe("Arrived on scene");

    await rerender(<IncidentStatusStepper status="Transporting" onAction={jest.fn()} />);
    expect(getByTestId("status-primary-action").props.accessibilityLabel).toBe("Arrived at destination");
  });

  it("offers the secondary branch action on scene, and calls onAction with its own action name", async () => {
    const onAction = jest.fn();
    const { getByTestId } = await render(<IncidentStatusStepper status="On Scene" onAction={onAction} />);

    const secondary = getByTestId("status-secondary-action");
    expect(secondary.props.accessibilityLabel).toBe("Begin treatment on scene");
    fireEvent.press(secondary);
    expect(onAction).toHaveBeenCalledWith("begin_treatment");
  });

  it("does not offer a secondary branch action at a step with no branch", async () => {
    const { queryByTestId } = await render(<IncidentStatusStepper status="Assigned" onAction={jest.fn()} />);
    expect(queryByTestId("status-secondary-action")).toBeNull();
  });

  it("shows a done state with no primary action once handover is complete", async () => {
    const { getByTestId, queryByTestId } = await render(<IncidentStatusStepper status="Handover Complete" onAction={jest.fn()} />);
    expect(getByTestId("status-stepper-done")).toBeTruthy();
    expect(queryByTestId("status-primary-action")).toBeNull();
  });

  it("disables the primary action and shows a spinner while busy", async () => {
    const { getByTestId } = await render(<IncidentStatusStepper status="Assigned" onAction={jest.fn()} busy />);
    expect(getByTestId("status-primary-action").props.accessibilityState?.disabled).toBe(true);
  });

  it("shows an error message when provided", async () => {
    const { getByTestId } = await render(<IncidentStatusStepper status="Assigned" onAction={jest.fn()} error="Network error" />);
    expect(getByTestId("status-stepper-error").props.children).toBe("Network error");
  });
});
