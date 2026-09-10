// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  OfficeViewModeProvider,
  useOfficeViewMode,
  OFFICE_VIEW_STORAGE_KEY,
  toggleOfficeViewMode,
  normalizeOfficeViewMode,
  readStoredOfficeViewMode,
} from "./use-office-view";

// Two separate consumers, mirroring the header and the Reception page.
function Header() {
  const { mode, toggleMode, hydrated } = useOfficeViewMode();
  const label = (hydrated ? mode : "3d") === "3d" ? "Simple view" : "Office view";
  return (
    <button type="button" aria-label={label} onClick={toggleMode}>
      {label}
    </button>
  );
}

function Page() {
  const { mode, hydrated } = useOfficeViewMode();
  if (!hydrated) return <div id="pending" />;
  return <div id={mode === "3d" ? "office-3d" : "simple-office"} />;
}

function renderOffice() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <OfficeViewModeProvider>
        <Header />
        <Page />
      </OfficeViewModeProvider>,
    );
  });
  return {
    container,
    label: () => container.querySelector("button")?.textContent,
    view: () => (container.querySelector("#simple-office") ? "simple" : container.querySelector("#office-3d") ? "3d" : "pending"),
    click: () => act(() => { container.querySelector("button")!.click(); }),
    unmount: () => act(() => root.unmount()),
  };
}

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
});

describe("office view mode helpers", () => {
  it("toggles between the two modes", () => {
    expect(toggleOfficeViewMode("3d")).toBe("simple");
    expect(toggleOfficeViewMode("simple")).toBe("3d");
  });

  it("falls back to 3d for unknown values", () => {
    expect(normalizeOfficeViewMode("nonsense")).toBe("3d");
    expect(normalizeOfficeViewMode(null)).toBe("3d");
    expect(normalizeOfficeViewMode("simple")).toBe("simple");
  });

  it("ignores invalid stored values", () => {
    window.localStorage.setItem(OFFICE_VIEW_STORAGE_KEY, "banana");
    expect(readStoredOfficeViewMode()).toBeNull();
  });
});

describe("OfficeViewModeProvider shared state", () => {
  it("keeps the header label and the page content in step", () => {
    const app = renderOffice();
    expect(app.label()).toBe("Simple view");
    expect(app.view()).toBe("3d");

    app.click();
    expect(app.label()).toBe("Office view");
    expect(app.view()).toBe("simple");

    app.click();
    expect(app.label()).toBe("Simple view");
    expect(app.view()).toBe("3d");
    app.unmount();
  });

  it("persists the mode to localStorage", () => {
    const app = renderOffice();
    app.click();
    expect(window.localStorage.getItem(OFFICE_VIEW_STORAGE_KEY)).toBe("simple");
    app.unmount();
  });

  it("restores the saved mode on a fresh mount for both consumers", () => {
    window.localStorage.setItem(OFFICE_VIEW_STORAGE_KEY, "simple");
    const app = renderOffice();
    expect(app.view()).toBe("simple");
    expect(app.label()).toBe("Office view");
    app.unmount();
  });

  it("does not overwrite a saved mode with the default on mount", () => {
    window.localStorage.setItem(OFFICE_VIEW_STORAGE_KEY, "simple");
    const app = renderOffice();
    expect(window.localStorage.getItem(OFFICE_VIEW_STORAGE_KEY)).toBe("simple");
    app.unmount();
  });
});
