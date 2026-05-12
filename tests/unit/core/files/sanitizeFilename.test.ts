import {
  sanitizeFilename,
  SANITIZED_FILENAME_FALLBACK,
} from "@/core/files/sanitizeFilename";
import { FILE_REF_NAME_MAX_LENGTH } from "@/contracts/file";

const NUL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const DEL = String.fromCharCode(0x7f);
const SOH = String.fromCharCode(1);
const STX = String.fromCharCode(2);

describe("sanitizeFilename", () => {
  it("returns ordinary file names unchanged", () => {
    expect(sanitizeFilename("report.pdf")).toBe("report.pdf");
    expect(sanitizeFilename("photo-2026-05.jpg")).toBe("photo-2026-05.jpg");
    expect(sanitizeFilename("notes_v2.txt")).toBe("notes_v2.txt");
  });

  it("strips forward slashes (path-traversal sequence loses its path component)", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("....etcpasswd");
  });

  it("strips backslashes (Windows path separator)", () => {
    expect(sanitizeFilename("C:\\Users\\evil\\file.exe")).toBe(
      "C:Usersevilfile.exe",
    );
  });

  it("strips a leading slash that would otherwise make the name absolute", () => {
    expect(sanitizeFilename("/etc/passwd")).toBe("etcpasswd");
  });

  it("strips null bytes", () => {
    expect(sanitizeFilename(`report${NUL}.pdf`)).toBe("report.pdf");
  });

  it("strips ASCII control characters (tab, newline, carriage return)", () => {
    expect(sanitizeFilename(`a${TAB}b${LF}c${CR}d.txt`)).toBe("abcd.txt");
  });

  it("strips the DEL character (0x7f)", () => {
    expect(sanitizeFilename(`name${DEL}.txt`)).toBe("name.txt");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeFilename("  report.pdf  ")).toBe("report.pdf");
  });

  it("falls back to the sentinel name when the result would be empty", () => {
    expect(sanitizeFilename("")).toBe(SANITIZED_FILENAME_FALLBACK);
    expect(sanitizeFilename("   ")).toBe(SANITIZED_FILENAME_FALLBACK);
    expect(sanitizeFilename("///")).toBe(SANITIZED_FILENAME_FALLBACK);
    expect(sanitizeFilename(`${NUL}${SOH}${STX}`)).toBe(
      SANITIZED_FILENAME_FALLBACK,
    );
  });

  it(`truncates names longer than ${FILE_REF_NAME_MAX_LENGTH} characters`, () => {
    const over = "a".repeat(FILE_REF_NAME_MAX_LENGTH + 50);
    const out = sanitizeFilename(over);
    expect(out.length).toBe(FILE_REF_NAME_MAX_LENGTH);
  });

  it(`preserves names at exactly ${FILE_REF_NAME_MAX_LENGTH} characters`, () => {
    const exact = "b".repeat(FILE_REF_NAME_MAX_LENGTH);
    expect(sanitizeFilename(exact)).toBe(exact);
  });

  it("preserves common non-separator punctuation (dot, hyphen, underscore, parens, brackets)", () => {
    expect(sanitizeFilename("my.file-name_v2 (final) [v2].txt")).toBe(
      "my.file-name_v2 (final) [v2].txt",
    );
  });

  it("preserves unicode letters / emoji (only ASCII path / control chars are stripped)", () => {
    expect(sanitizeFilename("résumé.pdf")).toBe("résumé.pdf");
    expect(sanitizeFilename("photo📸.jpg")).toBe("photo📸.jpg");
  });
});
