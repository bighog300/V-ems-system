import test from "node:test";
import assert from "node:assert/strict";

class FakeElement {
  constructor({ value = "", checked = false } = {}) {
    this.value = value;
    this.checked = checked;
    this.innerHTML = "";
    this.textContent = "";
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  dispatch(type) {
    const handlers = this.listeners.get(type) ?? [];
    for (const handler of handlers) {
      handler({ currentTarget: this, preventDefault() {} });
    }
  }

  querySelectorAll() {
    return [];
  }

  getAttribute() {
    return "";
  }
}

function createTestDocument() {
  const elements = new Map([
    ["apiBaseUrl", new FakeElement({ value: "http://example.test" })],
    ["authToken", new FakeElement({ value: "test-token" })],
    ["incidentId", new FakeElement({ value: "INC-000001" })],
    ["status", new FakeElement()],
    ["dispatcherBoardOutput", new FakeElement()],
    ["loadIncident", new FakeElement()],
    ["loadBoard", new FakeElement()],
    ["loadCrewIncident", new FakeElement()],
    ["loadDispatcherBoard", new FakeElement()],
    ["boardFilterActive", new FakeElement({ checked: false })],
    ["boardFilterStatus", new FakeElement({ value: "all" })],
    ["boardFilterPriority", new FakeElement({ value: "all" })],
    ["boardSortBy", new FakeElement({ value: "priority" })],
    ["boardAutoRefresh", new FakeElement({ checked: true })],
    ["incidentOutput", new FakeElement()],
    ["crewJobOutput", new FakeElement()],
    ["crewIncidentOutput", new FakeElement()]
  ]);

  return {
    elements,
    querySelector(selector) {
      const id = selector.startsWith("#") ? selector.slice(1) : selector;
      const element = elements.get(id);
      if (!element) {
        throw new Error(`Missing fake DOM element for selector: ${selector}`);
      }
      return element;
    }
  };
}

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("dispatcher controls and polling lifecycle behave correctly at DOM-event level", async () => {
  const fakeDocument = createTestDocument();
  const fetchCalls = [];
  const intervals = [];
  const clearedIntervals = [];
  let intervalIdSeed = 0;

  global.document = fakeDocument;
  global.fetch = async (url) => {
    fetchCalls.push(url);
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          incidents: [
            {
              incident_id: "INC-001",
              priority: "high",
              status: "Closed",
              location_summary: "Closed lane",
              created_at: "2026-04-16T10:00:00Z"
            },
            {
              incident_id: "INC-002",
              priority: "critical",
              status: "Awaiting Dispatch",
              location_summary: "Critical lane",
              created_at: "2026-04-16T09:00:00Z"
            },
            {
              incident_id: "INC-003",
              priority: "medium",
              status: "Assigned",
              location_summary: "Latest lane",
              created_at: "2026-04-16T12:00:00Z"
            }
          ]
        };
      }
    };
  };

  global.window = {
    location: { search: "" },
    setInterval(handler, timeoutMs) {
      const id = ++intervalIdSeed;
      intervals.push({ id, handler, timeoutMs });
      return id;
    },
    clearInterval(id) {
      clearedIntervals.push(id);
    }
  };

  await import("../src/main.mjs");

  assert.equal(intervals.length, 1, "auto-refresh should register polling at startup");
  assert.equal(intervals[0].timeoutMs, 15000);

  const activeOnly = fakeDocument.elements.get("boardFilterActive");
  activeOnly.checked = true;
  activeOnly.dispatch("change");
  await nextTick();

  let boardHtml = fakeDocument.elements.get("dispatcherBoardOutput").innerHTML;
  assert.doesNotMatch(boardHtml, /INC-001/, "closed incident should be filtered when active-only is enabled");

  const statusFilter = fakeDocument.elements.get("boardFilterStatus");
  statusFilter.value = "Awaiting Dispatch";
  statusFilter.dispatch("change");
  await nextTick();

  boardHtml = fakeDocument.elements.get("dispatcherBoardOutput").innerHTML;
  assert.match(boardHtml, /INC-002/);
  assert.doesNotMatch(boardHtml, /INC-003/);

  const priorityFilter = fakeDocument.elements.get("boardFilterPriority");
  priorityFilter.value = "critical";
  priorityFilter.dispatch("change");
  await nextTick();

  boardHtml = fakeDocument.elements.get("dispatcherBoardOutput").innerHTML;
  assert.match(boardHtml, /INC-002/);
  assert.doesNotMatch(boardHtml, /INC-003/);

  statusFilter.value = "all";
  priorityFilter.value = "all";
  statusFilter.dispatch("change");
  await nextTick();

  const sortBy = fakeDocument.elements.get("boardSortBy");
  sortBy.value = "recency";
  sortBy.dispatch("change");
  await nextTick();

  boardHtml = fakeDocument.elements.get("dispatcherBoardOutput").innerHTML;
  assert.match(boardHtml, /\?incidentId=INC-003/, "recency sorting should still include newest incident");
  assert.match(boardHtml, /Pending Assignment/, "board should render urgency groups");
  assert.match(boardHtml, /Critical/, "board should render urgency groups");

  const autoRefresh = fakeDocument.elements.get("boardAutoRefresh");
  autoRefresh.checked = false;
  autoRefresh.dispatch("change");
  await nextTick();

  assert.deepEqual(clearedIntervals, [1], "disabling auto-refresh should stop existing polling interval");

  autoRefresh.checked = true;
  autoRefresh.dispatch("change");
  await nextTick();

  assert.equal(intervals.length, 2, "re-enabling auto-refresh should start polling again");
  assert.equal(intervals[1].timeoutMs, 15000);

  assert.ok(fetchCalls.length >= 7, "each control interaction should re-render and fetch board data");
  assert.match(fakeDocument.elements.get("status").textContent, /Dispatcher board loaded\./);
});

test("dispatcher polling stops and renders auth-specific messaging on 401 and 403 failures", async () => {
  for (const scenario of [
    { status: 401, expectedStatus: "Session expired. Sign in again." },
    { status: 403, expectedStatus: "Access denied. You do not have permission to view this." }
  ]) {
    const fakeDocument = createTestDocument();
    const intervals = [];
    const clearedIntervals = [];
    let intervalIdSeed = 0;

    global.document = fakeDocument;
    global.fetch = async () => ({
      ok: false,
      status: scenario.status,
      async json() {
        return { error: { message: "Auth failure" } };
      }
    });
    global.window = {
      location: { search: "" },
      setInterval(handler, timeoutMs) {
        const id = ++intervalIdSeed;
        intervals.push({ id, handler, timeoutMs });
        return id;
      },
      clearInterval(id) {
        clearedIntervals.push(id);
      }
    };

    await import(`../src/main.mjs?auth-status=${scenario.status}-${Date.now()}`);
    fakeDocument.elements.get("loadDispatcherBoard").dispatch("click");
    await nextTick();

    assert.equal(intervals.length, 1, `scenario ${scenario.status}: polling should be started once`);
    assert.deepEqual(clearedIntervals, [1], `scenario ${scenario.status}: polling should stop on auth failure`);
    assert.equal(fakeDocument.elements.get("status").textContent, scenario.expectedStatus);
    assert.match(fakeDocument.elements.get("dispatcherBoardOutput").innerHTML, /error-note/);
  }
});
