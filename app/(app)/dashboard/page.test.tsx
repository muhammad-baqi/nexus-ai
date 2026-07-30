import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DashboardPage from "./page";

describe("DashboardPage", () => {
  it("renders all six section placeholders with empty-state copy", () => {
    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "Recent Items" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recently Viewed" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Favorites" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent Collections" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Statistics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upcoming Reminders" })).toBeInTheDocument();
    expect(screen.getByText(/no upcoming reminders/i)).toBeInTheDocument();
  });
});
