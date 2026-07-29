import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import VerifyEmailPage from "./page";

async function renderWithStatus(status?: string) {
  const ui = await VerifyEmailPage({ searchParams: Promise.resolve({ status }) });
  render(ui);
}

describe("VerifyEmailPage", () => {
  it("renders the success state", async () => {
    await renderWithStatus("success");

    expect(screen.getByText(/your email is verified/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to home/i })).toHaveAttribute("href", "/");
  });

  it("renders the expired state with a link back to register", async () => {
    await renderWithStatus("expired");

    expect(screen.getByText(/this link has expired/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /register again/i })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("renders the invalid state with a link back to register", async () => {
    await renderWithStatus("invalid");

    expect(screen.getByText(/this link isn't valid/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /register again/i })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("falls back to the invalid state for a missing or unrecognized status", async () => {
    await renderWithStatus(undefined);
    expect(screen.getByText(/this link isn't valid/i)).toBeInTheDocument();

    await renderWithStatus("something-unexpected");
    expect(screen.getAllByText(/this link isn't valid/i).length).toBeGreaterThan(0);
  });
});
