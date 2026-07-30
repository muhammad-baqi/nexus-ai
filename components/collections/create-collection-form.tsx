"use client";

import { useState, type FormEvent } from "react";

import {
  COLLECTION_COLORS,
  COLLECTION_ICONS,
  createCollectionSchema,
  DEFAULT_COLLECTION_COLOR,
  DEFAULT_COLLECTION_ICON,
} from "@/lib/validation/collections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  onCreated: () => void;
};

export function CreateCollectionForm({ onCreated }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_COLLECTION_COLOR);
  const [icon, setIcon] = useState<string>(DEFAULT_COLLECTION_ICON);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  function reset() {
    setName("");
    setDescription("");
    setColor(DEFAULT_COLLECTION_COLOR);
    setIcon(DEFAULT_COLLECTION_ICON);
    setFieldError(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = createCollectionSchema.safeParse({
      name,
      description: description || undefined,
      color,
      icon,
    });
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message);
      return;
    }

    setFieldError(undefined);
    setIsSubmitting(true);

    const response = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result.data),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setFieldError(body?.error?.message ?? "Something went wrong creating the collection.");
      return;
    }

    reset();
    setIsOpen(false);
    onCreated();
  }

  if (!isOpen) {
    return (
      <Button type="button" onClick={() => setIsOpen(true)}>
        New collection
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-2 rounded-lg border border-border p-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newCollectionName">Name</Label>
        <Input
          id="newCollectionName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!fieldError}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newCollectionDescription">Description</Label>
        <Input
          id="newCollectionDescription"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newCollectionColor">Color</Label>
          <select
            id="newCollectionColor"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            {COLLECTION_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newCollectionIcon">Icon</Label>
          <select
            id="newCollectionIcon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            {COLLECTION_ICONS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
      </div>
      {fieldError && (
        <p className="text-destructive text-sm" role="alert">
          {fieldError}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            reset();
            setIsOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
