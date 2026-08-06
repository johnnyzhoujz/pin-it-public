import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../src/components/ui/button.jsx";

globalThis.React = React;

describe("shared button", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("uses the primary regular button treatment by default", () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button.classList.contains("ui-button-primary")).toBe(true);
    expect(button.classList.contains("ui-button-md")).toBe(true);
    expect(button.getAttribute("type")).toBe("button");
  });

  it("gives icon buttons a fixed size and derives a native tooltip from their accessible label", () => {
    const onClick = vi.fn();
    render(
      <Button variant="dangerGhost" size="icon-sm" aria-label="Delete pin" onClick={onClick}>
        <span aria-hidden="true">×</span>
      </Button>
    );

    const button = screen.getByRole("button", { name: "Delete pin" });
    expect(button.classList.contains("ui-button-danger-ghost")).toBe(true);
    expect(button.classList.contains("ui-button-icon-sm")).toBe(true);
    expect(button.getAttribute("title")).toBe("Delete pin");

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
