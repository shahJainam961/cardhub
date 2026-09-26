import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DealCardView } from "./DealCardView";

describe("DealCardView", () => {
  it("prints the rent for each set size on a property card", () => {
    const { container } = render(
      <DealCardView
        card={{ id: "p", kind: "property", color: "darkBlue", name: "Boardwalk", value: 4 }}
      />,
    );
    expect(screen.getByRole("img", { name: "Boardwalk" })).toBeInTheDocument();
    // Dark blue: 1 card earns 3M, the full set of 2 earns 8M.
    expect(container).toHaveTextContent(/1\s*3M\s*2\s*8M/);
  });

  it("prints both colors' rent on a two-color wild, and none on an every-color wild", () => {
    const two = render(
      <DealCardView card={{ id: "w", kind: "wild", colors: ["railroad", "utility"], value: 2 }} />,
    );
    expect(two.container).toHaveTextContent(/1\s*1M\s*2\s*2M\s*3\s*3M\s*4\s*4M/); // railroads
    expect(two.container).toHaveTextContent(/1\s*1M\s*2\s*2M(?!\s*3)/); // utilities
    two.unmount();

    const any = render(<DealCardView card={{ id: "a", kind: "wild", colors: "any", value: 0 }} />);
    expect(any.container).not.toHaveTextContent(/\dM/);
  });

  it("uses a compact rent line on small table cards", () => {
    const { container } = render(
      <DealCardView
        size="sm"
        card={{ id: "p", kind: "property", color: "green", name: "Pacific Avenue", value: 4 }}
      />,
    );
    expect(container).toHaveTextContent("2·4·7M");
  });
});
