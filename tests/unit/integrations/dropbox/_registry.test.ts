/**
 * @jest-environment node
 *
 * Dropbox registry wiring — Slice 3.DROPBOX-2. Pins manifest registration
 * + the full 11-action handler-registry surface (no duplicates, all
 * functions).
 */
import { dropboxManifest } from "@/integrations/dropbox/manifest";
import { getProvider, listProviders } from "@/integrations/_registry";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

const EXPECTED_DROPBOX_ACTIONS = [
  "upload_file",
  "download_file",
  "get_file_metadata",
  "list_folder",
  "search_files",
  "create_folder",
  "move_file",
  "copy_file",
  "delete_file",
  "create_shared_link",
  "get_temporary_link",
];

describe("dropbox provider registry", () => {
  it("returns the Dropbox manifest under id 'dropbox'", () => {
    expect(getProvider("dropbox")).toBe(dropboxManifest);
  });

  it("listProviders includes 'dropbox'", () => {
    expect(listProviders().some((p) => p.id === "dropbox")).toBe(true);
  });
});

describe("dropbox handler registry", () => {
  it("registers exactly the 11 accepted Dropbox actions", () => {
    const types = listRegisteredHandlers()
      .filter((h) => h.provider === "dropbox")
      .map((h) => h.type);
    expect(types.sort()).toEqual([...EXPECTED_DROPBOX_ACTIONS].sort());
    expect(types).toHaveLength(11);
  });

  it("registers no duplicate (provider, type) pairs for Dropbox", () => {
    const keys = listRegisteredHandlers()
      .filter((h) => h.provider === "dropbox")
      .map((h) => `${h.provider}:${h.type}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
